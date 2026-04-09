param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [string]$SqlHost = $env:SQLSERVER_HOST,
    [int]$SqlPort = $(if ($env:SQLSERVER_PORT) { [int]$env:SQLSERVER_PORT } else { 1433 }),
    [string]$SqlDatabase = $env:SQLSERVER_DATABASE,
    [string]$SqlUsername = $env:SQLSERVER_USERNAME,
    [string]$SqlPassword = $env:SQLSERVER_PASSWORD,
    [string]$EnvPath
)

$ErrorActionPreference = 'Stop'

function Import-DotEnv {
    param([string]$Path)

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

function New-SqlConnection {
    $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
    $builder['Data Source'] = '{0},{1}' -f $SqlHost, $SqlPort
    $builder['Initial Catalog'] = $SqlDatabase
    $builder['User ID'] = $SqlUsername
    $builder['Password'] = $SqlPassword
    $builder['Encrypt'] = $true
    $builder['TrustServerCertificate'] = $true
    $builder['Connect Timeout'] = 15
    $connection = New-Object System.Data.SqlClient.SqlConnection $builder.ConnectionString
    $connection.Open()
    return $connection
}

function Invoke-NonQuery {
    param(
        [System.Data.SqlClient.SqlConnection]$Connection,
        [string]$Sql,
        [hashtable]$Parameters = @{}
    )

    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = $Sql
    foreach ($key in $Parameters.Keys) {
        $value = $Parameters[$key]
        $param = $cmd.Parameters.Add("@$key", [System.Data.SqlDbType]::NVarChar, -1)
        $param.Value = if ($null -eq $value) { [DBNull]::Value } else { $value }
    }
    [void]$cmd.ExecuteNonQuery()
}

function Invoke-Scalar {
    param(
        [System.Data.SqlClient.SqlConnection]$Connection,
        [string]$Sql,
        [hashtable]$Parameters = @{}
    )

    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = $Sql
    foreach ($key in $Parameters.Keys) {
        $value = $Parameters[$key]
        $param = $cmd.Parameters.Add("@$key", [System.Data.SqlDbType]::NVarChar, -1)
        $param.Value = if ($null -eq $value) { [DBNull]::Value } else { $value }
    }
    return $cmd.ExecuteScalar()
}

function Ensure-WorkflowColumns {
    param([System.Data.SqlClient.SqlConnection]$Connection)

    $sql = @'
IF COL_LENGTH(N'dbo.workflows', N'created_by') IS NULL
    ALTER TABLE dbo.workflows ADD created_by NVARCHAR(255) NULL;
IF COL_LENGTH(N'dbo.workflows', N'updated_by') IS NULL
    ALTER TABLE dbo.workflows ADD updated_by NVARCHAR(255) NULL;
IF COL_LENGTH(N'dbo.workflows', N'file_path') IS NULL
    ALTER TABLE dbo.workflows ADD file_path NVARCHAR(1024) NULL;
IF COL_LENGTH(N'dbo.workflows', N'content') IS NULL
    ALTER TABLE dbo.workflows ADD content NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.workflows', N'icon_name') IS NULL
    ALTER TABLE dbo.workflows ADD icon_name NVARCHAR(255) NULL;
IF COL_LENGTH(N'dbo.workflows', N'color_scheme') IS NULL
    ALTER TABLE dbo.workflows ADD color_scheme NVARCHAR(100) NULL;
'@

    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = $sql
    [void]$cmd.ExecuteNonQuery()
}

function Get-ValuesSql {
    param([string]$RawSql)

    $marker = 'VALUES'
    $index = $RawSql.IndexOf($marker, [System.StringComparison]::OrdinalIgnoreCase)
    if ($index -lt 0) {
        throw 'Could not find VALUES clause in SQL dump.'
    }

    $valuesSql = $RawSql.Substring($index + $marker.Length).Trim()
    if ($valuesSql.EndsWith(';')) {
        $valuesSql = $valuesSql.Substring(0, $valuesSql.Length - 1)
    }
    return $valuesSql
}

function Split-Tuples {
    param([string]$ValuesSql)

    $rows = New-Object System.Collections.Generic.List[string]
    $buffer = New-Object System.Text.StringBuilder
    $depth = 0
    $inString = $false

    for ($i = 0; $i -lt $ValuesSql.Length; $i++) {
        $ch = $ValuesSql[$i]

        if ($ch -eq "'") {
            if ($inString -and $i + 1 -lt $ValuesSql.Length -and $ValuesSql[$i + 1] -eq "'") {
                [void]$buffer.Append("''")
                $i++
                continue
            }
            $inString = -not $inString
            [void]$buffer.Append($ch)
            continue
        }

        if (-not $inString -and $ch -eq '(') {
            if ($depth -gt 0) {
                [void]$buffer.Append($ch)
            }
            $depth++
            continue
        }

        if (-not $inString -and $ch -eq ')') {
            $depth--
            if ($depth -eq 0) {
                $rows.Add($buffer.ToString())
                $buffer.Clear() | Out-Null
                continue
            }
        }

        if ($depth -gt 0) {
            [void]$buffer.Append($ch)
        }
    }

    return @($rows)
}

function Split-SqlFields {
    param([string]$TupleSql)

    $fields = New-Object System.Collections.Generic.List[string]
    $buffer = New-Object System.Text.StringBuilder
    $inString = $false

    for ($i = 0; $i -lt $TupleSql.Length; $i++) {
        $ch = $TupleSql[$i]

        if ($ch -eq "'") {
            if ($inString -and $i + 1 -lt $TupleSql.Length -and $TupleSql[$i + 1] -eq "'") {
                [void]$buffer.Append("''")
                $i++
                continue
            }
            $inString = -not $inString
            [void]$buffer.Append($ch)
            continue
        }

        if (-not $inString -and $ch -eq ',') {
            $fields.Add($buffer.ToString().Trim())
            $buffer.Clear() | Out-Null
            continue
        }

        [void]$buffer.Append($ch)
    }

    $fields.Add($buffer.ToString().Trim())
    return @($fields)
}

function ConvertFrom-SqlLiteral {
    param([string]$Literal)

    $trimmed = $Literal.Trim()
    if ($trimmed -ieq 'null') {
        return $null
    }
    if ($trimmed -ieq 'true') {
        return $true
    }
    if ($trimmed -ieq 'false') {
        return $false
    }
    if ($trimmed.Length -ge 2 -and $trimmed[0] -eq "'" -and $trimmed[$trimmed.Length - 1] -eq "'") {
        $inner = $trimmed.Substring(1, $trimmed.Length - 2)
        return $inner.Replace("''", "'")
    }
    if ($trimmed -match '^-?\d+$') {
        return [int]$trimmed
    }
    return $trimmed
}

function Convert-ToUtcDateTime {
    param([object]$Value)

    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
        return $null
    }

    return [DateTimeOffset]::Parse([string]$Value).UtcDateTime
}

function Get-IsTerminalStatus {
    param(
        [string]$Code,
        [string]$Label
    )

    $value = ('{0} {1}' -f $Code, $Label).ToLowerInvariant()
    return $value.Contains('closed') -or $value.Contains('resolved') -or $value.Contains('afgesloten') -or $value.Contains('opgelost')
}

function Get-IsFirstResponseStatus {
    param(
        [string]$Code,
        [string]$Label
    )

    $value = ('{0} {1}' -f $Code, $Label).ToLowerInvariant()
    return $value.Contains('acknow') -or $value.Contains('ontvangst') -or $value.Contains('bevest')
}

function Parse-StatusesFromJson {
    param([string]$StatusesJson)

    if ([string]::IsNullOrWhiteSpace($StatusesJson)) {
        return @()
    }

    try {
        $items = @((ConvertFrom-Json -InputObject $StatusesJson))
    } catch {
        return @()
    }

    $index = 0
    return @($items | ForEach-Object {
        $index++
        $codeValue = if ($null -ne $_.code) { [string]$_.code } else { '' }
        $labelValue = if ($null -ne $_.label) { [string]$_.label } elseif ($null -ne $_.code) { [string]$_.code } else { '' }
        $descriptionValue = if ($null -ne $_.description) { [string]$_.description } else { '' }
        $colorValue = if ($null -ne $_.color) { [string]$_.color } else { '' }
        [pscustomobject]@{
            Code = $codeValue
            Label = $labelValue
            Description = $descriptionValue
            Color = $colorValue
            SortOrder = if ($null -ne $_.order) { [int]$_.order } else { $index }
            ExpectedDurationDays = $null
        }
    } | Where-Object { -not [string]::IsNullOrWhiteSpace($_.Code) })
}

function Parse-StatusesFromContent {
    param([string]$Content)

    if ([string]::IsNullOrWhiteSpace($Content)) {
        return @()
    }

    $lines = $Content -split "`r?`n"
    $stages = New-Object System.Collections.Generic.List[object]
    $current = $null

    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith(';')) {
            continue
        }

        if ($trimmed -match '^\[stage:([^\]]+)\]$') {
            if ($null -ne $current) {
                $stages.Add([pscustomobject]$current)
            }
            $current = @{
                stage_code = $matches[1]
                name = $matches[1]
                status_code = $matches[1]
                timeline_days = $null
                timeline_desc = $null
            }
            continue
        }

        if ($null -eq $current) {
            continue
        }

        if ($trimmed -match '^name\s*=\s*(.+)$') {
            $current.name = $matches[1].Trim()
            continue
        }
        if ($trimmed -match '^status_code\s*=\s*(.+)$') {
            $current.status_code = $matches[1].Trim()
            continue
        }
        if ($trimmed -match '^timeline_days\s*=\s*(\d+)$') {
            $current.timeline_days = [int]$matches[1]
            continue
        }
        if ($trimmed -match '^timeline_desc\s*=\s*(.+)$') {
            $current.timeline_desc = $matches[1].Trim()
            continue
        }
    }

    if ($null -ne $current) {
        $stages.Add([pscustomobject]$current)
    }

    $seen = @{}
    $out = New-Object System.Collections.Generic.List[object]
    $index = 0
    foreach ($stage in $stages) {
        $code = [string]$stage.status_code
        if ([string]::IsNullOrWhiteSpace($code) -or $seen.ContainsKey($code)) {
            continue
        }
        $seen[$code] = $true
        $index++
        $out.Add([pscustomobject]@{
            Code = $code
            Label = [string]$stage.name
            Description = [string]$stage.timeline_desc
            Color = $null
            SortOrder = $index
            ExpectedDurationDays = $stage.timeline_days
        })
    }

    return $out.ToArray()
}

function Upsert-Workflow {
    param(
        [System.Data.SqlClient.SqlConnection]$Connection,
        [hashtable]$Workflow
    )

    $sql = @'
IF EXISTS (SELECT 1 FROM dbo.workflows WHERE id = @id)
BEGIN
    UPDATE dbo.workflows
    SET
        code = @code,
        name = @name,
        description = @description,
        active = @active,
        created_at = @created_at,
        updated_at = @updated_at,
        created_by = @created_by,
        updated_by = @updated_by,
        file_path = @file_path,
        content = @content,
        icon_name = @icon_name,
        color_scheme = @color_scheme,
        display_order = @display_order
    WHERE id = @id;
END
ELSE
BEGIN
    INSERT INTO dbo.workflows (
        id, code, name, description, active, created_at, updated_at,
        created_by, updated_by, file_path, content, icon_name, color_scheme, display_order
    )
    VALUES (
        @id, @code, @name, @description, @active, @created_at, @updated_at,
        @created_by, @updated_by, @file_path, @content, @icon_name, @color_scheme, @display_order
    );
END
'@

    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = $sql

    $paramDefs = @(
        @{ Name = 'id'; Type = [System.Data.SqlDbType]::UniqueIdentifier; Value = [Guid]::Parse($Workflow.id) },
        @{ Name = 'code'; Type = [System.Data.SqlDbType]::NVarChar; Size = 100; Value = $Workflow.code },
        @{ Name = 'name'; Type = [System.Data.SqlDbType]::NVarChar; Size = 255; Value = $Workflow.name },
        @{ Name = 'description'; Type = [System.Data.SqlDbType]::NVarChar; Size = -1; Value = $Workflow.description },
        @{ Name = 'active'; Type = [System.Data.SqlDbType]::Bit; Value = [bool]$Workflow.active },
        @{ Name = 'created_at'; Type = [System.Data.SqlDbType]::DateTime2; Value = (Convert-ToUtcDateTime $Workflow.created_at) },
        @{ Name = 'updated_at'; Type = [System.Data.SqlDbType]::DateTime2; Value = (Convert-ToUtcDateTime $Workflow.updated_at) },
        @{ Name = 'created_by'; Type = [System.Data.SqlDbType]::NVarChar; Size = 255; Value = $Workflow.created_by },
        @{ Name = 'updated_by'; Type = [System.Data.SqlDbType]::NVarChar; Size = 255; Value = $Workflow.updated_by },
        @{ Name = 'file_path'; Type = [System.Data.SqlDbType]::NVarChar; Size = 1024; Value = $Workflow.file_path },
        @{ Name = 'content'; Type = [System.Data.SqlDbType]::NVarChar; Size = -1; Value = $Workflow.content },
        @{ Name = 'icon_name'; Type = [System.Data.SqlDbType]::NVarChar; Size = 255; Value = $Workflow.icon_name },
        @{ Name = 'color_scheme'; Type = [System.Data.SqlDbType]::NVarChar; Size = 100; Value = $Workflow.color_scheme },
        @{ Name = 'display_order'; Type = [System.Data.SqlDbType]::Int; Value = [int]$Workflow.display_order }
    )

    foreach ($def in $paramDefs) {
        if ($def.Size) {
            $param = $cmd.Parameters.Add("@$($def.Name)", $def.Type, $def.Size)
        } else {
            $param = $cmd.Parameters.Add("@$($def.Name)", $def.Type)
        }
        $param.Value = if ($null -eq $def.Value -or (($def.Value -is [string]) -and $def.Value -eq '')) { [DBNull]::Value } else { $def.Value }
    }

    [void]$cmd.ExecuteNonQuery()
}

function Sync-WorkflowStatuses {
    param(
        [System.Data.SqlClient.SqlConnection]$Connection,
        [string]$WorkflowId,
        [object[]]$Statuses
    )

    $deleteCmd = $Connection.CreateCommand()
    $deleteCmd.CommandText = 'DELETE FROM dbo.workflow_statuses WHERE workflow_id = @workflow_id'
    $null = $deleteCmd.Parameters.Add('@workflow_id', [System.Data.SqlDbType]::UniqueIdentifier)
    $deleteCmd.Parameters['@workflow_id'].Value = [Guid]::Parse($WorkflowId)
    [void]$deleteCmd.ExecuteNonQuery()

    foreach ($status in $Statuses) {
        $cmd = $Connection.CreateCommand()
        $cmd.CommandText = @'
INSERT INTO dbo.workflow_statuses (
    id, workflow_id, code, label, description, color, sort_order, is_terminal, is_first_response,
    next_codes, expected_duration_days, created_at, updated_at
)
VALUES (
    @id, @workflow_id, @code, @label, @description, @color, @sort_order, @is_terminal, @is_first_response,
    @next_codes, @expected_duration_days, SYSUTCDATETIME(), SYSUTCDATETIME()
)
'@

        $paramMap = @(
            @{ Name = 'id'; Type = [System.Data.SqlDbType]::UniqueIdentifier; Value = [Guid]::NewGuid() },
            @{ Name = 'workflow_id'; Type = [System.Data.SqlDbType]::UniqueIdentifier; Value = [Guid]::Parse($WorkflowId) },
            @{ Name = 'code'; Type = [System.Data.SqlDbType]::NVarChar; Size = 100; Value = [string]$status.Code },
            @{ Name = 'label'; Type = [System.Data.SqlDbType]::NVarChar; Size = 255; Value = [string]$status.Label },
            @{ Name = 'description'; Type = [System.Data.SqlDbType]::NVarChar; Size = -1; Value = [string]$status.Description },
            @{ Name = 'color'; Type = [System.Data.SqlDbType]::NVarChar; Size = 50; Value = [string]$status.Color },
            @{ Name = 'sort_order'; Type = [System.Data.SqlDbType]::Int; Value = [int]$status.SortOrder },
            @{ Name = 'is_terminal'; Type = [System.Data.SqlDbType]::Bit; Value = (Get-IsTerminalStatus -Code ([string]$status.Code) -Label ([string]$status.Label)) },
            @{ Name = 'is_first_response'; Type = [System.Data.SqlDbType]::Bit; Value = (Get-IsFirstResponseStatus -Code ([string]$status.Code) -Label ([string]$status.Label)) },
            @{ Name = 'next_codes'; Type = [System.Data.SqlDbType]::NVarChar; Size = -1; Value = $null },
            @{ Name = 'expected_duration_days'; Type = [System.Data.SqlDbType]::Int; Value = $status.ExpectedDurationDays }
        )

        foreach ($def in $paramMap) {
            if ($def.Size) {
                $param = $cmd.Parameters.Add("@$($def.Name)", $def.Type, $def.Size)
            } else {
                $param = $cmd.Parameters.Add("@$($def.Name)", $def.Type)
            }
            $param.Value = if ($null -eq $def.Value -or (($def.Value -is [string]) -and $def.Value -eq '')) { [DBNull]::Value } else { $def.Value }
        }

        [void]$cmd.ExecuteNonQuery()
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

if (-not $SqlHost) { $SqlHost = $env:SQLSERVER_HOST }
if (-not $SqlDatabase) { $SqlDatabase = $env:SQLSERVER_DATABASE }
if (-not $SqlUsername) { $SqlUsername = $env:SQLSERVER_USERNAME }
if (-not $SqlPassword) { $SqlPassword = $env:SQLSERVER_PASSWORD }

if (-not (Test-Path -LiteralPath $FilePath)) {
    throw "File not found: $FilePath"
}

if (-not $SqlHost -or -not $SqlDatabase -or -not $SqlUsername -or -not $SqlPassword) {
    throw 'Set SQLSERVER_HOST, SQLSERVER_DATABASE, SQLSERVER_USERNAME, and SQLSERVER_PASSWORD in your shell or .env before running this script.'
}

$rawSql = Get-Content -LiteralPath $FilePath -Raw
$tupleSqls = Split-Tuples -ValuesSql (Get-ValuesSql -RawSql $rawSql)

$connection = New-SqlConnection
try {
    Ensure-WorkflowColumns -Connection $connection

    $imported = 0
    $importedStatuses = 0

    foreach ($tupleSql in $tupleSqls) {
        $fields = Split-SqlFields -TupleSql $tupleSql
        if ($fields.Count -lt 15) {
            throw "Unexpected workflow row shape. Expected 15 fields, got $($fields.Count)."
        }

        $workflow = @{
            id = [string](ConvertFrom-SqlLiteral $fields[0])
            code = [string](ConvertFrom-SqlLiteral $fields[1])
            name = [string](ConvertFrom-SqlLiteral $fields[2])
            description = ConvertFrom-SqlLiteral $fields[3]
            active = [bool](ConvertFrom-SqlLiteral $fields[4])
            created_at = ConvertFrom-SqlLiteral $fields[5]
            updated_at = ConvertFrom-SqlLiteral $fields[6]
            created_by = ConvertFrom-SqlLiteral $fields[7]
            updated_by = ConvertFrom-SqlLiteral $fields[8]
            file_path = ConvertFrom-SqlLiteral $fields[9]
            content = ConvertFrom-SqlLiteral $fields[10]
            icon_name = ConvertFrom-SqlLiteral $fields[11]
            color_scheme = ConvertFrom-SqlLiteral $fields[12]
            display_order = [int](ConvertFrom-SqlLiteral $fields[13])
            statuses_json = ConvertFrom-SqlLiteral $fields[14]
        }

        Upsert-Workflow -Connection $connection -Workflow $workflow
        $imported++

        $statuses = Parse-StatusesFromJson -StatusesJson ([string]$workflow.statuses_json)
        if (-not $statuses -or $statuses.Count -eq 0) {
            $statuses = Parse-StatusesFromContent -Content ([string]$workflow.content)
        }
        Sync-WorkflowStatuses -Connection $connection -WorkflowId $workflow.id -Statuses $statuses
        $importedStatuses += @($statuses).Count
    }

    $workflowCount = Invoke-Scalar -Connection $connection -Sql 'SELECT COUNT(*) FROM dbo.workflows'
    $statusCount = Invoke-Scalar -Connection $connection -Sql 'SELECT COUNT(*) FROM dbo.workflow_statuses'

    Write-Host "Imported $imported workflow row(s) from $FilePath"
    Write-Host "Imported $importedStatuses workflow status row(s)"
    Write-Host "dbo.workflows count: $workflowCount"
    Write-Host "dbo.workflow_statuses count: $statusCount"
} finally {
    $connection.Dispose()
}
