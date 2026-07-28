<?php

use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// Register the Composer autoloader...
if (file_exists(__DIR__.'/../vendor/autoload.php')) {
    require __DIR__.'/../vendor/autoload.php';
}

// Bootstrap Laravel and handle the request...
$app = require_once __DIR__.'/../bootstrap/app.php';
$app->handleRequest(Request::capture());
