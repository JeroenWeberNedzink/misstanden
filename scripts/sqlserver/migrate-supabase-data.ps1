param(
    [string]$SupabaseUrl = $env:VITE_SUPABASE_URL,
    [string]$SupabaseServiceKey = $(if ($env:SUPABASE_SERVICE_ROLE_KEY) { $env:SUPABASE_SERVICE_ROLE_KEY } else { $env:SUPABASE_SERVICE_KEY }),
    [string]$SqlHost = $env:SQLSERVER_HOST,
    [int]$SqlPort = $(if ($env:SQLSERVER_PORT) { [int]$env:SQLSERVER_PORT } else { 1433 }),
    [string]$SqlDatabase = $env:SQLSERVER_DATABASE,
    [string]$SqlUsername = $env:SQLSERVER_USERNAME,
    [string]$SqlPassword = $env:SQLSERVER_PASSWORD,
    [int]$PageSize = 500,
    [string]$EnvPath
)

$ErrorActionPreference = 'Stop'

function Import-DotEnv {
    param(
        [string]$Path
    )

    if (-not $Path -or -not (Test-Path -LiteralPath $Path)) {
        return
    }

    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) {
            continue
        }

        $separatorIndex = $trimmed.IndexOf('=')
        if ($separatorIndex -lt 1) {
            continue
        }

        $name = $trimmed.Substring(0, $separatorIndex).Trim()
        $value = $trimmed.Substring($separatorIndex + 1).Trim()

        if ($value.Length -ge 2) {
            $firstChar = $value.Substring(0, 1)
            $lastChar = $value.Substring($value.Length - 1, 1)
            if (($firstChar -eq '"' -and $lastChar -eq '"') -or ($firstChar -eq "'" -and $lastChar -eq "'")) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }

        if (-not [string]::IsNullOrWhiteSpace($name) -and [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) {
            [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }
    }
}

if (-not $EnvPath) {
    $repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    foreach ($candidate in @(
        (Join-Path $repoRoot '.env'),
        (Join-Path $repoRoot '.env.local')
    )) {
        if (Test-Path -LiteralPath $candidate) {
            $EnvPath = $candidate
            break
        }
    }
}

Import-DotEnv -Path $EnvPath

if (-not $SupabaseUrl) { $SupabaseUrl = $env:VITE_SUPABASE_URL }
if (-not $SupabaseServiceKey) {
    $SupabaseServiceKey = if ($env:SUPABASE_SERVICE_ROLE_KEY) { $env:SUPABASE_SERVICE_ROLE_KEY } else { $env:SUPABASE_SERVICE_KEY }
}
if (-not $SqlHost) { $SqlHost = $env:SQLSERVER_HOST }
if (-not $SqlPort -and $env:SQLSERVER_PORT) { $SqlPort = [int]$env:SQLSERVER_PORT }
if (-not $SqlDatabase) { $SqlDatabase = $env:SQLSERVER_DATABASE }
if (-not $SqlUsername) { $SqlUsername = $env:SQLSERVER_USERNAME }
if (-not $SqlPassword) { $SqlPassword = $env:SQLSERVER_PASSWORD }

if (-not $SupabaseUrl -or -not $SupabaseServiceKey) {
    throw 'Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your shell or .env before running this script.'
}

if (-not $SqlHost -or -not $SqlDatabase -or -not $SqlUsername -or -not $SqlPassword) {
    throw 'Set SQLSERVER_HOST, SQLSERVER_DATABASE, SQLSERVER_USERNAME, and SQLSERVER_PASSWORD in your shell or .env before running this script.'
}

$tables = @(
    'handlers',
    'roles',
    'permissions',
    'role_permissions',
    'handler_roles',
    'workflows',
    'workflow_statuses',
    'handler_workflows',
    'locations',
    'system_settings',
    'incident_severities',
    'tickets',
    'ticket_handlers',
    'ticket_comments',
    'messages',
    'attachments',
    'ticket_actions',
    'access_requests',
    'ticket_reply_tokens',
    'guest_access',
    'sla_escalations',
    'email_event_types',
    'email_admin_settings',
    'handler_email_preferences',
    'handler_notification_settings',
    'user_availability',
    'notification_logs',
    'translation_audit_log',
    'audit_logs',
    'workflow_phases',
    'workflow_phase_steps',
    'workflow_contacts',
    'user_profiles'
)

function New-SqlConnection {
    $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
    $builder['Data Source'] = '{0},{1}' -f $SqlHost, $SqlPort
    $builder['Initial Catalog'] = $SqlDatabase
    $builder['User ID'] = $SqlUsername
    $builder['Password'] = $SqlPassword
    $builder['Encrypt'] = $true
    $builder['TrustServerCertificate'] = $true
    $builder['Connect Timeout'] = 15
    $conn = New-Object System.Data.SqlClient.SqlConnection $builder.ConnectionString
    $conn.Open()
    return $conn
}

function Get-SupabaseRows {
    param([string]$TableName)

    $allRows = New-Object System.Collections.Generic.List[object]
    $offset = 0
    while ($true) {
        $url = '{0}/rest/v1/{1}?select=*&limit={2}&offset={3}' -f $SupabaseUrl.TrimEnd('/'), $TableName, $PageSize, $offset
        $headers = @{
            apikey = $SupabaseServiceKey
            Authorization = "Bearer $SupabaseServiceKey"
        }

        $rows = Invoke-RestMethod -Method Get -Uri $url -Headers $headers -ContentType 'application/json'
        if ($null -eq $rows) {
            break
        }

        $batch = @($rows)
        foreach ($row in $batch) {
            [void]$allRows.Add($row)
        }

        if ($batch.Count -lt $PageSize) {
            break
        }
        $offset += $PageSize
    }

    return @($allRows)
}

function Get-TargetColumns {
    param(
        [System.Data.SqlClient.SqlConnection]$Connection,
        [string]$TableName
    )

    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = @"
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME = @table
ORDER BY ORDINAL_POSITION
"@
    $null = $cmd.Parameters.Add('@table', [System.Data.SqlDbType]::NVarChar, 255)
    $cmd.Parameters['@table'].Value = $TableName
    $reader = $cmd.ExecuteReader()
    $columns = @()
    while ($reader.Read()) {
        $columns += [pscustomobject]@{
            name = $reader.GetString(0)
            data_type = $reader.GetString(1)
        }
    }
    $reader.Close()
    return $columns
}

function Convert-RowValue {
    param([object]$Value)

    if ($null -eq $Value) {
        return $null
    }

    if ($Value -is [bool] -or $Value -is [int] -or $Value -is [long] -or $Value -is [double] -or $Value -is [decimal]) {
        return $Value
    }

    if ($Value -is [string]) {
        return $Value
    }

    if ($Value -is [datetime]) {
        return ([datetime]$Value).ToString('o')
    }

    return ($Value | ConvertTo-Json -Depth 20 -Compress)
}

function Convert-ForSqlType {
    param(
        [object]$Value,
        [string]$SqlType
    )

    if ($null -eq $Value) {
        return $null
    }

    switch ($SqlType) {
        'UniqueIdentifier' { return [Guid]::Parse([string]$Value) }
        'Bit' { return [bool]$Value }
        'Int' { return [int]$Value }
        'BigInt' { return [long]$Value }
        'Float' { return [double]$Value }
        'DateTime2' { return [DateTime]::Parse([string]$Value) }
        'DateTime' { return [DateTime]::Parse([string]$Value) }
        'Date' { return [DateTime]::Parse([string]$Value).Date }
        default { return $Value }
    }
}

function Clear-Table {
    param(
        [System.Data.SqlClient.SqlConnection]$Connection,
        [string]$TableName
    )

    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = "DELETE FROM dbo.[$TableName]"
    [void]$cmd.ExecuteNonQuery()
}

function Insert-Rows {
    param(
        [System.Data.SqlClient.SqlConnection]$Connection,
        [string]$TableName,
        [object[]]$Columns,
        [object[]]$Rows
    )

    foreach ($row in $Rows) {
        $rowProps = $row.PSObject.Properties.Name
        $usableColumns = @($Columns | Where-Object { $rowProps -contains $_.name })
        if ($usableColumns.Count -eq 0) {
            continue
        }

        $colSql = ($usableColumns | ForEach-Object { '[' + $_.name + ']' }) -join ', '
        $paramSql = ($usableColumns | ForEach-Object { '@' + $_.name }) -join ', '

        $cmd = $Connection.CreateCommand()
        $cmd.CommandText = "INSERT INTO dbo.[$TableName] ($colSql) VALUES ($paramSql)"
        foreach ($column in $usableColumns) {
            $columnName = [string]$column.name
            $columnType = [string]$column.data_type
            switch ($columnType) {
                'uniqueidentifier' { $sqlType = [System.Data.SqlDbType]::UniqueIdentifier; break }
                'bit' { $sqlType = [System.Data.SqlDbType]::Bit; break }
                'int' { $sqlType = [System.Data.SqlDbType]::Int; break }
                'bigint' { $sqlType = [System.Data.SqlDbType]::BigInt; break }
                'float' { $sqlType = [System.Data.SqlDbType]::Float; break }
                'datetime2' { $sqlType = [System.Data.SqlDbType]::DateTime2; break }
                'datetime' { $sqlType = [System.Data.SqlDbType]::DateTime; break }
                'date' { $sqlType = [System.Data.SqlDbType]::Date; break }
                default { $sqlType = [System.Data.SqlDbType]::NVarChar; break }
            }

            if ($sqlType -eq [System.Data.SqlDbType]::NVarChar) {
                $param = $cmd.Parameters.Add('@' + $columnName, $sqlType, -1)
            } else {
                $param = $cmd.Parameters.Add('@' + $columnName, $sqlType)
            }

            $value = Convert-RowValue -Value $row.$columnName
            $value = Convert-ForSqlType -Value $value -SqlType $sqlType.ToString()
            $param.Value = if ($null -eq $value) { [System.DBNull]::Value } else { $value }
        }
        [void]$cmd.ExecuteNonQuery()
    }
}

$connection = New-SqlConnection
try {
    Write-Host 'Running source connectivity preflight'
    [void](Get-SupabaseRows -TableName 'handlers')

    for ($i = $tables.Count - 1; $i -ge 0; $i--) {
        $table = $tables[$i]
        Write-Host "Clearing $table"
        Clear-Table -Connection $connection -TableName $table
    }

    foreach ($table in $tables) {
        $columns = Get-TargetColumns -Connection $connection -TableName $table
        if ($columns.Count -eq 0) {
            Write-Warning "Skipping $table because it does not exist in SQL Server."
            continue
        }

        Write-Host "Fetching $table from Supabase"
        $rows = Get-SupabaseRows -TableName $table
        Write-Host "Importing $($rows.Count) row(s) into $table"
        Insert-Rows -Connection $connection -TableName $table -Columns $columns -Rows $rows
    }

    Write-Host "Supabase data migrated to SQL Server database $SqlDatabase"
} finally {
    $connection.Dispose()
}
