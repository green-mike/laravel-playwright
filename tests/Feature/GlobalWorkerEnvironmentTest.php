<?php

namespace Hyvor\LaravelPlaywright\Tests\Feature;

use Hyvor\LaravelPlaywright\Tests\TestCase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Route;

class GlobalWorkerEnvironmentTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        
        // Create a test route to verify global middleware works
        Route::get('/test-worker-env', function () {
            return response()->json([
                'database_connection' => Config::get('database.default'),
                'redis_prefix' => Config::get('database.redis.default.prefix', null),
            ]);
        });
    }

    public function testGlobalMiddlewareAppliesWorkerEnvironment(): void
    {
        // Test without worker header - should use default connection
        $response = $this->getJson('/test-worker-env');
        $response->assertOk();
        
        /** @var array{database_connection: string, redis_prefix: string|null} $data */
        $data = $response->json();
        $this->assertEquals('testing', $data['database_connection']);

        // Test with worker header - should switch to worker-specific connection
        $response = $this->getJson('/test-worker-env', [
            'X-Playwright-Worker' => '5'
        ]);
        $response->assertOk();

        /** @var array{database_connection: string, redis_prefix: string|null} $data */
        $data = $response->json();
        $this->assertEquals('testing_worker_5', $data['database_connection']);
        $this->assertEquals('worker_5:', $data['redis_prefix']);
    }

    public function testPlaywrightRoutesStillWork(): void
    {
        // Ensure playwright routes still work after removing specific middleware
        $this->postJson('/playwright/dynamicConfig', [
            'key' => 'test.global.middleware',
            'value' => 'working'
        ])->assertOk();

        // Verify config was set
        $configFile = storage_path('laravel-playwright-config.json');
        $this->assertTrue(file_exists($configFile));
    }

    public function testWorkerSpecificPlaywrightRoutes(): void
    {
        // Test playwright routes with worker header
        $this->postJson('/playwright/dynamicConfig', [
            'key' => 'test.worker.middleware',
            'value' => 'worker_specific'
        ], [
            'X-Playwright-Worker' => '3'
        ])->assertOk();

        // Verify worker-specific config file was created
        $workerConfigFile = storage_path('laravel-playwright-config-worker-3.json');
        $this->assertTrue(file_exists($workerConfigFile));
        
        /** @var array<string, mixed> $content */
        $content = json_decode((string) file_get_contents($workerConfigFile), true);
        $this->assertEquals('worker_specific', $content['test.worker.middleware']);
    }

    protected function tearDown(): void
    {
        // Clean up any test config files
        $files = glob(storage_path('laravel-playwright-config*.json')) ?: [];
        foreach ($files as $file) {
            if (file_exists($file)) {
                unlink($file);
            }
        }
        
        parent::tearDown();
    }
}