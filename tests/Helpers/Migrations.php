<?php

namespace Hyvor\LaravelPlaywright\Tests\Helpers;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class Migrations
{

    public static function run(): void
    {
        Schema::dropIfExists('users');

        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->timestamps();
        });
    }

}