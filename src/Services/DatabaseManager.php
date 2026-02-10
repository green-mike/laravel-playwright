<?php declare(strict_types=1);

namespace Hyvor\LaravelPlaywright\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Config;
use Exception;

class DatabaseManager
{
    /** @var array<string, bool> */
    private static array $createdDatabases = [];

    /**
     * Create worker-specific database if it doesn't exist
     */
    public static function ensureWorkerDatabase(string $workerId): void
    {
        $databaseName = "testing_worker_{$workerId}";

        // Skip if already created in this process
        if (isset(self::$createdDatabases[$databaseName])) {
            return;
        }

        $defaultConnection = Config::get('database.default');
        if (!is_string($defaultConnection)) {
            return;
        }

        /** @var array<string, mixed>|null $defaultConfig */
        $defaultConfig = Config::get("database.connections.{$defaultConnection}");
        if (!is_array($defaultConfig)) {
            return;
        }

        $driver = $defaultConfig['driver'] ?? null;

        if ($driver === 'mysql') {
            self::createMySQLDatabase($workerId, $defaultConfig);
        } elseif ($driver === 'pgsql') {
            self::createPostgreSQLDatabase($workerId, $defaultConfig);
        }
        // SQLite doesn't need database creation, just use separate files

        self::$createdDatabases[$databaseName] = true;
    }

    /**
     * @param array<string, mixed> $config
     */
    private static function createMySQLDatabase(string $workerId, array $config): void
    {
        $databaseName = "testing_worker_{$workerId}";

        try {
            // Create temporary connection without specifying database
            $tempConfig = $config;
            unset($tempConfig['database']);

            Config::set('database.connections.temp_admin', $tempConfig);

            // Check if database exists
            $databases = DB::connection('temp_admin')
                ->select('SHOW DATABASES LIKE ?', [$databaseName]);

            if (empty($databases)) {
                // Create the database
                DB::connection('temp_admin')
                    ->statement("CREATE DATABASE `{$databaseName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            }

            // Clean up temporary connection
            Config::set('database.connections.temp_admin', null);
            DB::purge('temp_admin');

        } catch (Exception $e) {
            // Log error but don't throw - let the test continue
            error_log("Failed to create MySQL database for worker {$workerId}: " . $e->getMessage());
        }
    }

    /**
     * @param array<string, mixed> $config
     */
    private static function createPostgreSQLDatabase(string $workerId, array $config): void
    {
        $databaseName = "testing_worker_{$workerId}";

        try {
            // Create temporary connection to 'postgres' database
            $tempConfig = $config;
            $tempConfig['database'] = 'postgres';

            Config::set('database.connections.temp_admin', $tempConfig);

            // Check if database exists
            $databases = DB::connection('temp_admin')
                ->select("SELECT 1 FROM pg_database WHERE datname = ?", [$databaseName]);

            if (empty($databases)) {
                // Create the database
                DB::connection('temp_admin')
                    ->statement("CREATE DATABASE \"{$databaseName}\"");
            }

            // Clean up temporary connection
            Config::set('database.connections.temp_admin', null);
            DB::purge('temp_admin');

        } catch (Exception $e) {
            // Log error but don't throw - let the test continue
            error_log("Failed to create PostgreSQL database for worker {$workerId}: " . $e->getMessage());
        }
    }

    /**
     * Drop worker-specific database
     */
    public static function dropWorkerDatabase(string $workerId): void
    {
        $defaultConnection = Config::get('database.default');
        if (!is_string($defaultConnection)) {
            return;
        }

        /** @var array<string, mixed>|null $defaultConfig */
        $defaultConfig = Config::get("database.connections.{$defaultConnection}");

        if (!is_array($defaultConfig)) {
            return;
        }

        $driver = $defaultConfig['driver'] ?? null;

        if ($driver === 'mysql') {
            self::dropMySQLDatabase($workerId, $defaultConfig);
        } elseif ($driver === 'pgsql') {
            self::dropPostgreSQLDatabase($workerId, $defaultConfig);
        }
    }

    /**
     * @param array<string, mixed> $config
     */
    private static function dropMySQLDatabase(string $workerId, array $config): void
    {
        $databaseName = "testing_worker_{$workerId}";

        try {
            $tempConfig = $config;
            unset($tempConfig['database']);

            Config::set('database.connections.temp_admin', $tempConfig);

            DB::connection('temp_admin')
                ->statement("DROP DATABASE IF EXISTS `{$databaseName}`");

            Config::set('database.connections.temp_admin', null);
            DB::purge('temp_admin');

        } catch (Exception $e) {
            error_log("Failed to drop MySQL database for worker {$workerId}: " . $e->getMessage());
        }
    }

    /**
     * @param array<string, mixed> $config
     */
    private static function dropPostgreSQLDatabase(string $workerId, array $config): void
    {
        $databaseName = "testing_worker_{$workerId}";

        try {
            $tempConfig = $config;
            $tempConfig['database'] = 'postgres';

            Config::set('database.connections.temp_admin', $tempConfig);

            DB::connection('temp_admin')
                ->statement("DROP DATABASE IF EXISTS \"{$databaseName}\"");

            Config::set('database.connections.temp_admin', null);
            DB::purge('temp_admin');

        } catch (Exception $e) {
            error_log("Failed to drop PostgreSQL database for worker {$workerId}: " . $e->getMessage());
        }
    }
}
