import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { buildTypeOrmOptions } from '../../src/database/typeorm.options';

const seedSql = readFileSync(
  join(__dirname, '..', '..', 'database.sql'),
  'utf8',
);

/**
 * Deja la base de test en el estado del seed: borra el esquema, ejecuta
 * database.sql completo y corre las migraciones.
 */
export async function resetDatabase(): Promise<void> {
  const dataSource = new DataSource({
    ...buildTypeOrmOptions(process.env.DATABASE_URL!),
    migrationsRun: false,
  });
  await dataSource.initialize();
  try {
    await dataSource.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await dataSource.query(seedSql);
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}
