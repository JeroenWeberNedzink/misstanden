param(
    [string]$SqlHost = $env:SQLSERVER_HOST,
    [int]$Port = $(if ($env:SQLSERVER_PORT) { [int]$env:SQLSERVER_PORT } else { 1433 }),
    [string]$Database = $env:SQLSERVER_DATABASE,
    [string]$Username = $env:SQLSERVER_USERNAME,
    [string]$Password = $env:SQLSERVER_PASSWORD,
    [string]$SchemaPath = (Join-Path $PSScriptRoot 'bootstrap-schema.sql'),
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

if (-not $SqlHost) { $SqlHost = $env:SQLSERVER_HOST }
if (-not $Port -and $env:SQLSERVER_PORT) { $Port = [int]$env:SQLSERVER_PORT }
if (-not $Database) { $Database = $env:SQLSERVER_DATABASE }
if (-not $Username) { $Username = $env:SQLSERVER_USERNAME }
if (-not $Password) { $Password = $env:SQLSERVER_PASSWORD }

if (-not $SqlHost -or -not $Database -or -not $Username -or -not $Password) {
    throw 'Set SQLSERVER_HOST, SQLSERVER_DATABASE, SQLSERVER_USERNAME, and SQLSERVER_PASSWORD in your shell or .env before running this script.'
}

if (-not (Test-Path $SchemaPath)) {
    throw "Schema file not found: $SchemaPath"
}

$builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
$builder['Data Source'] = '{0},{1}' -f $SqlHost, $Port
$builder['Initial Catalog'] = $Database
$builder['User ID'] = $Username
$builder['Password'] = $Password
$builder['Encrypt'] = $true
$builder['TrustServerCertificate'] = $true
$builder['Connect Timeout'] = 10

$connection = New-Object System.Data.SqlClient.SqlConnection $builder.ConnectionString
$connection.Open()
try {
    $permissionCheck = $connection.CreateCommand()
    $permissionCheck.CommandText = @'
SELECT
    HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE TABLE') AS can_create_table,
    IS_ROLEMEMBER('db_ddladmin') AS is_db_ddladmin,
    IS_ROLEMEMBER('db_owner') AS is_db_owner;
'@
    $reader = $permissionCheck.ExecuteReader()
    $hasSchemaPermission = $false
    if ($reader.Read()) {
        $canCreateTable = [int]$reader['can_create_table']
        $isDbDdlAdmin = [int]$reader['is_db_ddladmin']
        $isDbOwner = [int]$reader['is_db_owner']
        $hasSchemaPermission = ($canCreateTable -eq 1) -or ($isDbDdlAdmin -eq 1) -or ($isDbOwner -eq 1)
    }
    $reader.Dispose()

    if (-not $hasSchemaPermission) {
        throw "Connected to $Database on $SqlHost, but this login cannot create tables. Grant CREATE TABLE, db_ddladmin, or db_owner before bootstrapping."
    }

    $command = $connection.CreateCommand()
    $command.CommandTimeout = 300
    $command.CommandText = Get-Content -Path $SchemaPath -Raw
    [void]$command.ExecuteNonQuery()
    Write-Host "SQL Server schema bootstrapped into $Database on $SqlHost"
} catch [System.Data.SqlClient.SqlException] {
    $details = @()
    foreach ($error in $_.Exception.Errors) {
        $details += "SQL error on line $($error.LineNumber): $($error.Message)"
    }
    throw ($details -join [Environment]::NewLine)
} finally {
    $connection.Dispose()
}
