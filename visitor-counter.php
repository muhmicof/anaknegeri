<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$baseDir = __DIR__;
$dataFile = $baseDir . '/visitor-counter.json';

function loadStats($file) {
    if (!file_exists($file)) {
        return ['date' => date('Y-m-d'), 'today' => 0, 'total' => 0];
    }

    $content = @file_get_contents($file);
    if ($content === false || trim($content) === '') {
        return ['date' => date('Y-m-d'), 'today' => 0, 'total' => 0];
    }

    $data = json_decode($content, true);
    if (!is_array($data)) {
        return ['date' => date('Y-m-d'), 'today' => 0, 'total' => 0];
    }

    return [
        'date' => isset($data['date']) ? $data['date'] : date('Y-m-d'),
        'today' => isset($data['today']) ? (int) $data['today'] : 0,
        'total' => isset($data['total']) ? (int) $data['total'] : 0,
    ];
}

function saveStats($file, $data) {
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    return file_put_contents($file, $json, LOCK_EX);
}

$today = date('Y-m-d');
$stats = loadStats($dataFile);

if ($stats['date'] !== $today) {
    $stats['date'] = $today;
    $stats['today'] = 0;
}

$sessionKey = 'visitor_' . session_id();
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (!isset($_SESSION['visitor_counted']) || $_SESSION['visitor_counted'] !== true) {
    $stats['today'] += 1;
    $stats['total'] += 1;
    $_SESSION['visitor_counted'] = true;
    saveStats($dataFile, $stats);
}

echo json_encode([
    'date' => $stats['date'],
    'today' => $stats['today'],
    'total' => $stats['total'],
]);
