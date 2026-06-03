# Script de backup PostgreSQL pour Kotbo
# Ce script utilise pg_dump pour créer une sauvegarde de la base de données

# Configuration
$BACKUP_DIR = ".\backups\database"
$RETENTION_DAYS = 7  # Garder les backups pendant 7 jours
$TIMESTAMP = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"

# Créer le répertoire de backup s'il n'existe pas
if (-not (Test-Path $BACKUP_DIR)) {
    New-Item -ItemType Directory -Path $BACKUP_DIR -Force
    Write-Host "✅ Répertoire de backup créé: $BACKUP_DIR"
}

# Charger les variables d'environnement depuis .env
$envFile = ".\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            $name = $matches[1]
            $value = $matches[2]
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
    Write-Host "✅ Variables d'environnement chargées depuis .env"
} else {
    Write-Host "⚠️ Fichier .env non trouvé, utilisation des variables d'environnement système"
}

# Récupérer la DATABASE_URL
$DATABASE_URL = $env:DATABASE_URL
if (-not $DATABASE_URL) {
    Write-Host "❌ ERREUR: DATABASE_URL n'est pas définie"
    exit 1
}

# Parser la DATABASE_URL
# Format: postgresql://user:password@host:5432/dbname
if ($DATABASE_URL -match 'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)') {
    $DB_USER = $matches[1]
    $DB_PASSWORD = $matches[2]
    $DB_HOST = $matches[3]
    $DB_PORT = $matches[4]
    $DB_NAME = $matches[5]
    
    Write-Host "📊 Base de données: $DB_NAME@$DB_HOST:$DB_PORT"
} else {
    Write-Host "❌ ERREUR: Format de DATABASE_URL invalide"
    exit 1
}

# Nom du fichier de backup
$BACKUP_FILE = "$BACKUP_DIR\kotbo_backup_$TIMESTAMP.sql"
$BACKUP_FILE_COMPRESSED = "$BACKUP_DIR\kotbo_backup_$TIMESTAMP.sql.gz"

Write-Host "🔄 Début du backup de la base de données..."
Write-Host "📁 Fichier de backup: $BACKUP_FILE"

# Exécuter pg_dump
$env:PGPASSWORD = $DB_PASSWORD
$pgDumpPath = "pg_dump"

# Essayer de trouver pg_dump dans PATH
$pgDumpExists = Get-Command $pgDumpPath -ErrorAction SilentlyContinue
if (-not $pgDumpExists) {
    # Chercher dans les emplacements courants de PostgreSQL sur Windows
    $possiblePaths = @(
        "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe",
        "C:\PostgreSQL\*\bin\pg_dump.exe"
    )
    
    foreach ($path in $possiblePaths) {
        $found = Get-ChildItem $path -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) {
            $pgDumpPath = $found.FullName
            Write-Host "✅ pg_dump trouvé: $pgDumpPath"
            break
        }
    }
    
    if (-not (Get-Command $pgDumpPath -ErrorAction SilentlyContinue)) {
        Write-Host "❌ ERREUR: pg_dump n'est pas trouvé dans PATH"
        Write-Host "   Installez PostgreSQL ou ajoutez le chemin de pg_dump à votre PATH"
        exit 1
    }
}

# Exécuter le backup
& $pgDumpPath -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME --format=plain --no-owner --no-acl > $BACKUP_FILE

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backup réussi: $BACKUP_FILE"
    
    # Compresser le fichier avec gzip (si disponible)
    $gzipPath = "gzip"
    $gzipExists = Get-Command $gzipPath -ErrorAction SilentlyContinue
    if ($gzipExists) {
        & $gzipPath $BACKUP_FILE
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Backup compressé: $BACKUP_FILE_COMPRESSED"
            $BACKUP_FILE = $BACKUP_FILE_COMPRESSED
        } else {
            Write-Host "⚠️ Compression échouée, fichier non compressé conservé"
        }
    } else {
        Write-Host "⚠️ gzip non trouvé, fichier non compressé"
    }
    
    # Afficher la taille du fichier
    $fileSize = (Get-Item $BACKUP_FILE).Length / 1MB
    Write-Host "📊 Taille du backup: $([math]::Round($fileSize, 2)) MB"
    
} else {
    Write-Host "❌ ERREUR: Le backup a échoué avec le code $LASTEXITCODE"
    exit 1
}

# Nettoyer les anciens backups
Write-Host "🧹 Nettoyage des anciens backups (plus de $RETENTION_DAYS jours)..."
$cutoffDate = (Get-Date).AddDays(-$RETENTION_DAYS)

$oldBackups = Get-ChildItem $BACKUP_DIR -Filter "kotbo_backup_*.sql*" | Where-Object {
    $_.LastWriteTime -lt $cutoffDate
}

if ($oldBackups.Count -gt 0) {
    foreach ($backup in $oldBackups) {
        Remove-Item $backup.FullName -Force
        Write-Host "🗑️ Supprimé: $($backup.Name)"
    }
    Write-Host "✅ Nettoyage terminé: $($oldBackups.Count) fichier(s) supprimé(s)"
} else {
    Write-Host "✅ Aucun ancien backup à supprimer"
}

Write-Host "✨ Backup terminé avec succès!"
