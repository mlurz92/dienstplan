<?php
/**
 * Vorlage für die Zugangsdaten. Auf dem Webspace als `config.php` ablegen und
 * ausfüllen. `config.php` selbst gehört NICHT ins Repository (siehe .gitignore).
 *
 * Die Datenbank ist die Ablage, die auf IONOS an die Stelle von Workers KV
 * tritt: eine einzige Tabelle mit Schlüssel und JSON-Wert. Mehr braucht die
 * Anwendung nicht, und weniger bekäme man auf klassischem Webhosting nicht
 * transaktionssicher hin.
 */

return [
    // Aus dem IONOS-Kundenkonto: Hosting → Datenbanken → MySQL-Datenbank.
    // Der Host ist NICHT „localhost“, sondern der von IONOS genannte Servername.
    'dsn' => 'mysql:host=db5000000000.hosting-data.io;dbname=dbs0000000;charset=utf8mb4',
    'user' => 'dbu0000000',
    'password' => '',

    // Obergrenze je Wert. Ein Monat liegt bei wenigen Kilobyte; die Grenze
    // fängt versehentlich riesige Importe ab, bevor sie die Datenbank belasten.
    'maxBodyBytes' => 4 * 1024 * 1024,
];
