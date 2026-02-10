<?php declare(strict_types=1);

namespace Hyvor\LaravelPlaywright;

use Hyvor\LaravelPlaywright\Middleware\WorkerEnvironment;
use Hyvor\LaravelPlaywright\Services\Config;
use Hyvor\LaravelPlaywright\Services\DynamicConfig;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Support\Facades\App;
use Illuminate\Support\ServiceProvider as BaseServiceProvider;

class ServiceProvider extends BaseServiceProvider
{

    public function boot() : void
    {

        if (App::environment(...Config::envs())) {
            $this->loadRoutesFrom(__DIR__ . '/routes/e2e.php');

            // Register WorkerEnvironment middleware globally for all HTTP requests
            /** @var Kernel $kernel */
            $kernel = $this->app->make(Kernel::class);
            $kernel->prependMiddleware(WorkerEnvironment::class);

            /** @var DynamicConfig $dynamicConfig */
            $dynamicConfig = app(DynamicConfig::class);
            $dynamicConfig->load();
        }

    }

}