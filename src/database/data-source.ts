import { DataSource } from 'typeorm';
import { buildTypeOrmOptions, DEFAULT_DATABASE_URL } from './typeorm.options';

/**
 * DataSource para la CLI de TypeORM (npm run migration:run). La API no lo
 * usa: aplica las migraciones al arrancar, salvo con DB_RUN_MIGRATIONS=false.
 */
const url = new URL(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
console.log(`Target database: ${url.host}${url.pathname}`);

export default new DataSource(buildTypeOrmOptions(url.toString()));
