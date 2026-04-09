param(
    [Parameter(Mandatory = $true)]
    [string]$RequestPath,
    [Parameter(Mandatory = $true)]
    [string]$ResponsePath
)

$ErrorActionPreference = 'Stop'

function Convert-BridgeValue {
    param([object]$Value)

    if ($null -eq $Value -or $Value -is [System.DBNull]) {
        return $null
    }

    if ($Value -is [DateTime]) {
        return ([DateTime]$Value).ToString('o')
    }

    if ($Value -is [byte[]]) {
        return [Convert]::ToBase64String($Value)
    }

    return $Value
}

function Add-SqlParameter {
    param(
        [System.Data.SqlClient.SqlCommand]$Command,
        [object]$Parameter
    )

    $name = [string]$Parameter.name
    $hasDbType = $Parameter.PSObject.Properties.Name -contains 'dbType'
    $dbType = if ($hasDbType -and $null -ne $Parameter.dbType) { [string]$Parameter.dbType } else { 'NVarChar' }
    $value = $Parameter.value

    $sqlType = [System.Data.SqlDbType]::$dbType
    $sqlParameter = $Command.Parameters.Add($name, $sqlType)

    if ($null -eq $value) {
        $sqlParameter.Value = [System.DBNull]::Value
        return
    }

    switch ($dbType) {
        'Bit' { $sqlParameter.Value = [bool]$value; break }
        'Int' { $sqlParameter.Value = [int]$value; break }
        'BigInt' { $sqlParameter.Value = [long]$value; break }
        'Float' { $sqlParameter.Value = [double]$value; break }
        'UniqueIdentifier' { $sqlParameter.Value = [Guid]::Parse([string]$value); break }
        'DateTime2' { $sqlParameter.Value = [DateTime]::Parse([string]$value); break }
        default { $sqlParameter.Value = $value; break }
    }
}

try {
    $request = Get-Content -Path $RequestPath -Raw | ConvertFrom-Json
    $connConfig = $request.connection

    $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
    $builder['Data Source'] = '{0},{1}' -f $connConfig.host, $connConfig.port
    $builder['Initial Catalog'] = [string]$connConfig.database
    $builder['User ID'] = [string]$connConfig.username
    $builder['Password'] = [string]$connConfig.password
    $builder['Encrypt'] = [bool]$connConfig.encrypt
    $builder['TrustServerCertificate'] = [bool]$connConfig.trustServerCertificate
    $builder['Connect Timeout'] = [int]$connConfig.loginTimeout

    $connection = New-Object System.Data.SqlClient.SqlConnection $builder.ConnectionString
    $connection.Open()

    $transaction = $null
    if ($request.transaction -ne $false) {
        $transaction = $connection.BeginTransaction()
    }

    $results = @()
    foreach ($command in $request.commands) {
        $sqlCommand = $connection.CreateCommand()
        if ($transaction) {
            $sqlCommand.Transaction = $transaction
        }
        $sqlCommand.CommandText = [string]$command.sql
        $timeoutValue = 30
        if ($null -ne $connConfig.commandTimeout) {
            $timeoutValue = [int]$connConfig.commandTimeout
        }
        if ($null -ne $command.timeout) {
            $timeoutValue = [int]$command.timeout
        }
        $sqlCommand.CommandTimeout = $timeoutValue

        $paramsList = @()
        if ($null -ne $command.params) {
            $paramsList = @($command.params)
        }
        foreach ($parameter in $paramsList) {
            Add-SqlParameter -Command $sqlCommand -Parameter $parameter
        }

        $type = if ($null -ne $command.type) { [string]$command.type } else { 'query' }
        if ($type -eq 'scalar') {
            $value = $sqlCommand.ExecuteScalar()
            $results += @{ value = (Convert-BridgeValue $value) }
            continue
        }

        if ($type -eq 'nonquery') {
            $affected = $sqlCommand.ExecuteNonQuery()
            $results += @{ affected = [int]$affected }
            continue
        }

        $reader = $sqlCommand.ExecuteReader()
        $rows = @()
        while ($reader.Read()) {
            $row = @{}
            for ($i = 0; $i -lt $reader.FieldCount; $i++) {
                $row[$reader.GetName($i)] = Convert-BridgeValue $reader.GetValue($i)
            }
            $rows += $row
        }
        $reader.Close()
        $results += @{ rows = $rows }
    }

    if ($transaction) {
        $transaction.Commit()
    }

    @{ success = $true; results = $results } | ConvertTo-Json -Depth 10 | Set-Content -Path $ResponsePath -Encoding utf8
    exit 0
} catch {
    try {
        if ($transaction) {
            $transaction.Rollback()
        }
    } catch {
    }

    $message = $_.Exception.Message
    @{ success = $false; error = $message } | ConvertTo-Json -Depth 5 | Set-Content -Path $ResponsePath -Encoding utf8
    Write-Error $message
    exit 1
} finally {
    if ($connection) {
        $connection.Dispose()
    }
}
