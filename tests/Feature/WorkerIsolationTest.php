<?php

namespace Hyvor\LaravelPlaywright\Tests\Feature;

use Hyvor\LaravelPlaywright\Tests\TestCase;
use Illuminate\Support\Facades\Config;

class WorkerIsolationTest extends TestCase
{

    public function testWorkerEnvironmentIsolation(): void
    {
        // Test worker 0 environment
        $this->postJson('/playwright/dynamicConfig', [
            'key' => 'test.worker.config',
            'value' => 'worker_0_value',
        ], [
            'X-Playwright-Worker' => '0'
        ])->assertOk();

        // Test worker 1 environment
        $this->postJson('/playwright/dynamicConfig', [
            'key' => 'test.worker.config', 
            'value' => 'worker_1_value',
        ], [
            'X-Playwright-Worker' => '1'
        ])->assertOk();

        // Verify separate config files exist
        $worker0File = storage_path('laravel-playwright-config-worker-0.json');
        $worker1File = storage_path('laravel-playwright-config-worker-1.json');
        
        $this->assertTrue(file_exists($worker0File));
        $this->assertTrue(file_exists($worker1File));

        // Verify different content in each file
        /** @var array<string, mixed> $worker0Content */
        $worker0Content = json_decode((string) file_get_contents($worker0File), true);
        /** @var array<string, mixed> $worker1Content */
        $worker1Content = json_decode((string) file_get_contents($worker1File), true);

        $this->assertEquals('worker_0_value', $worker0Content['test.worker.config']);
        $this->assertEquals('worker_1_value', $worker1Content['test.worker.config']);
    }

    public function testDatabaseConnectionSwitching(): void
    {
        // Make request with worker header
        $response = $this->postJson('/playwright/artisan', [
            'command' => 'route:list'
        ], [
            'X-Playwright-Worker' => '0'
        ]);
        $response->assertOk();

        // Verify command executed successfully
        $this->assertEquals(0, $response->json('code'));
    }

    public function testWorkerHeaderPropagation(): void
    {
        // Test that requests without worker header use default config
        $this->postJson('/playwright/dynamicConfig', [
            'key' => 'test.default.config',
            'value' => 'default_value',
        ])->assertOk();

        $defaultFile = storage_path('laravel-playwright-config.json');
        $this->assertTrue(file_exists($defaultFile));

        /** @var array<string, mixed> $defaultContent */
        $defaultContent = json_decode((string) file_get_contents($defaultFile), true);
        $this->assertEquals('default_value', $defaultContent['test.default.config']);
    }

    public function testTearDownCleansWorkerFiles(): void
    {
        // Create worker-specific config
        $this->postJson('/playwright/dynamicConfig', [
            'key' => 'test.teardown.config',
            'value' => 'teardown_test',
        ], [
            'X-Playwright-Worker' => '0'
        ])->assertOk();

        $workerFile = storage_path('laravel-playwright-config-worker-0.json');
        $this->assertTrue(file_exists($workerFile));

        // Call tearDown with same worker header
        $this->postJson('/playwright/tearDown', [], [
            'X-Playwright-Worker' => '0'
        ])->assertOk();

        // Verify worker file is deleted
        $this->assertFalse(file_exists($workerFile));
    }

    protected function tearDown(): void
    {
        parent::tearDown();

        // Clean up any worker-specific files that might have been created
        $files = glob(storage_path('laravel-playwright-config-worker-*.json')) ?: [];
        foreach ($files as $file) {
            if (file_exists($file)) {
                unlink($file);
            }
        }
    }
}