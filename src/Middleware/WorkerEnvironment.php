<?php declare(strict_types=1);

namespace Hyvor\LaravelPlaywright\Middleware;

use Closure;
use Hyvor\LaravelPlaywright\Services\DatabaseManager;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class WorkerEnvironment
{
    /**
     * @param Closure(Request): Response $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $workerId = $request->header('X-Playwright-Worker');

        if ($workerId !== null) {
            $workerId = (string) $workerId;

            // Validate worker ID is a non-negative integer
            if (!preg_match('/^\d+$/', $workerId)) {
                return new \Illuminate\Http\JsonResponse(['error' => 'Invalid worker ID'], 400);
            }

            $this->configureWorkerEnvironment($workerId);
        }

        return $next($request);
    }
    
    private function configureWorkerEnvironment(string $workerId): void
    {
        // Configure database connection for this worker
        $this->configureDatabaseConnection($workerId);
        
        // Configure Redis prefix for this worker
        $this->configureRedisPrefix($workerId);
    }
    
    private function configureDatabaseConnection(string $workerId): void
    {
        $defaultConnection = Config::get('database.default');
        if (!is_string($defaultConnection)) {
            return;
        }

        $defaultConfig = Config::get("database.connections.{$defaultConnection}");
        
        if (!is_array($defaultConfig)) {
            return;
        }
        
        // Ensure worker database exists
        DatabaseManager::ensureWorkerDatabase($workerId);
        
        // Create worker-specific database configuration
        $workerConnection = "testing_worker_{$workerId}";
        $workerDatabaseName = "testing_worker_{$workerId}";
        
        $workerConfig = array_merge($defaultConfig, [
            'database' => $workerDatabaseName,
        ]);
        
        // Set the worker-specific database configuration
        Config::set("database.connections.{$workerConnection}", $workerConfig);
        
        // Switch to worker-specific connection
        Config::set('database.default', $workerConnection);
        
        // Purge existing connections to ensure fresh connection
        DB::purge();
    }
    
    private function configureRedisPrefix(string $workerId): void
    {
        $cacheConfig = Config::get('cache.stores.redis');
        if (is_array($cacheConfig)) {
            $cacheConfig['prefix'] = "worker_{$workerId}:cache:";
            Config::set('cache.stores.redis', $cacheConfig);
        }
        
        $sessionConfig = Config::get('session');
        if (is_array($sessionConfig)) {
            $sessionConfig['cookie'] = "laravel_session_worker_{$workerId}";
            Config::set('session', $sessionConfig);
        }
        
        // Configure Redis for other services
        $redisConfig = Config::get('database.redis.default');
        if (is_array($redisConfig)) {
            $redisConfig['prefix'] = "worker_{$workerId}:";
            Config::set('database.redis.default', $redisConfig);
        }
    }
}