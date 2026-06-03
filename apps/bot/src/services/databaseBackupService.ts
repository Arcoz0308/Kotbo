import cron from 'node-cron';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration du backup de la base de données
const DATABASE_BACKUP_ENABLED = true;
const DATABASE_BACKUP_TIME = '02:00'; // 2h du matin
const DATABASE_BACKUP_TIMEZONE = 'Europe/Paris';
const RETENTION_DAYS = 7; // Garder les backups pendant 7 jours

let backupTask: cron.ScheduledTask | null = null;

/**
 * Effectue un backup de la base de données PostgreSQL
 */
export async function performDatabaseBackup(): Promise<void> {
  console.log('🔄 Début du backup de la base de données PostgreSQL...');

  try {
    // Chemin vers le script PowerShell
    const scriptPath = path.join(__dirname, '../../../scripts/backup-database.ps1');
    
    // Exécuter le script PowerShell
    const { stdout, stderr } = await execAsync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, {
      cwd: path.join(__dirname, '../../../'),
    });

    if (stderr) {
      console.error('⚠️ Avertissement lors du backup:', stderr);
    }

    console.log('✅ Backup de la base de données terminé avec succès');
    console.log(stdout);
  } catch (error) {
    console.error('❌ Erreur lors du backup de la base de données:', error);
    throw error;
  }
}

/**
 * Initialise le système de backup automatique de la base de données
 */
export function initializeDatabaseBackup(): void {
  if (!DATABASE_BACKUP_ENABLED) {
    console.log('⚠️ Backup de la base de données désactivé');
    return;
  }

  if (backupTask) {
    backupTask.stop();
  }

  // Créer la tâche cron pour le backup quotidien
  backupTask = cron.schedule(
    `0 ${DATABASE_BACKUP_TIME.split(':')[0]} * * *`, // Tous les jours à l'heure spécifiée
    async () => {
      try {
        await performDatabaseBackup();
      } catch (error) {
        console.error('Erreur lors du backup automatique de la base de données:', error);
      }
    },
    {
      timezone: DATABASE_BACKUP_TIMEZONE,
    },
  );

  console.log(`✅ Backup automatique de la base de données initialisé à ${DATABASE_BACKUP_TIME} (${DATABASE_BACKUP_TIMEZONE})`);
}

/**
 * Arrête le backup automatique de la base de données
 */
export function stopDatabaseBackup(): void {
  if (backupTask) {
    backupTask.stop();
    backupTask = null;
    console.log('🛑 Backup automatique de la base de données arrêté');
  }
}

/**
 * Effectue un backup manuel de la base de données
 */
export async function manualDatabaseBackup(): Promise<string> {
  console.log('🔄 Backup manuel de la base de données...');
  await performDatabaseBackup();
  return 'Backup de la base de données terminé avec succès';
}
