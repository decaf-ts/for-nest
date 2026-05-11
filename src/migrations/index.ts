/**
 * @module for-nest/migrations
 * @description Migration utilities for NestJS integration
 * @summary Provides task-based migration orchestration as a separate module
 * @example
 * ```typescript
 * import { DecafMigrationModule } from '@decaf-ts/for-nest/migrations';
 * 
 * @Module({
 *   imports: [
 *     DecafMigrationModule
 *   ]
 * })
 * export class AppModule {}
 * ```
 */

export * from './migration-module';
