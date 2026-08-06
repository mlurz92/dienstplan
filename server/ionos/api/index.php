<?php
/**
 * Ein Frontcontroller für die gesamte `/api/`-Fläche — der Ersatz für die
 * Cloudflare Pages Functions auf IONOS Webhosting.
 *
 * Der Vertrag zum Frontend ist unverändert: dieselben Pfade, dieselben
 * Antwortkörper, dieselben Statuscodes. `js/api.js` bleibt deshalb unberührt.
 *
 * WARUM HIER NICHT NORMALISIERT WIRD
 *
 * Die Cloudflare-Fassung rief `js/defaults.js` auf, weil sie JavaScript war und
 * das ohne Kosten konnte. In PHP wäre dieselbe Prüfung eine zweite Fassung des
 * Regelwerks — fünfhundert Zeilen, die bei jeder Modelländerung mitwandern
 * müssten und beim ersten Vergessen auseinanderlaufen. Genau das ist die
 * gefährlichere Variante.
 *
 * Der Client normalisiert stattdessen an beiden Enden: Er schreibt
 * ausschließlich kanonische Daten (`state.js` normalisiert vor jedem Speichern)
 * und normalisiert alles Gelesene erneut, bevor es in den Zustand geht. Fehlt
 * ein Schlüssel, antwortet der Server mit `null`, und der Client setzt seine
 * Vorgaben ein — `normalizeSettings(null)` und `normalizeStaffList(null)` tun
 * genau das. Damit bleibt `js/defaults.js` die einzige Wahrheit.
 *
 * Der Server prüft dafür das, was ohne Regelwerk prüfbar ist und was eine
 * Datenbank vor Müll schützt: gültiges JSON, erwarteter Grundtyp, bekannter
 * Schlüssel, Jahr und Monat im Bereich, Größengrenze.
 */

declare(strict_types=1);

require __DIR__ . '/store.php';

const MAX_JSON_DEPTH = 64;

function sendJson(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function fail(string $message, int $status): never
{
    sendJson(['ok' => false, 'error' => $message], $status);
}

/**
 * Der Pfad hinter `/api`. Funktioniert mit PATH_INFO (Rewrite auf
 * `index.php/...`) und ohne (Rewrite mit erhaltener URI).
 */
function apiPath(): string
{
    $raw = $_SERVER['PATH_INFO'] ?? parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
    $position = strpos($raw, '/api/');
    if ($position !== false) {
        $raw = substr($raw, $position + 4);
    }
    return '/' . trim(preg_replace('#/+#', '/', $raw), '/');
}

function requestBody(int $limit): string
{
    $body = file_get_contents('php://input');
    if ($body === false) {
        fail('Anfragekörper konnte nicht gelesen werden.', 400);
    }
    if (strlen($body) > $limit) {
        fail('Anfragekörper überschreitet die zulässige Größe.', 413);
    }
    return $body;
}

/** Dekodiert und stellt sicher, dass der Wert überhaupt speicherbar ist. */
function decodeJson(string $body): mixed
{
    try {
        // `assoc = false`: Objekte bleiben Objekte. Mit assoziativen Arrays
        // würde `{}` beim Zurückschreiben zu `[]` — eine stille Formänderung an
        // jeder leeren Karte des Monatsmodells.
        return json_decode($body, false, MAX_JSON_DEPTH, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        fail('Ungültiges JSON.', 400);
    }
}

function isJsonObject(mixed $value): bool
{
    return $value instanceof stdClass;
}

/** Kanonischer Text für die Ablage — nie der rohe Anfragekörper. */
function encodeForStorage(mixed $value): string
{
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
}

function assertYearMonth(string $year, string $month): array
{
    if (preg_match('/^\d{4}$/', $year) !== 1) {
        fail('Jahr außerhalb des unterstützten Bereichs 2000–2200.', 400);
    }
    if (preg_match('/^\d{1,2}$/', $month) !== 1) {
        fail('Monat muss zwischen 1 und 12 liegen.', 400);
    }
    $numericYear = (int) $year;
    $numericMonth = (int) $month;
    if ($numericYear < 2000 || $numericYear > 2200) {
        fail('Jahr außerhalb des unterstützten Bereichs 2000–2200.', 400);
    }
    if ($numericMonth < 1 || $numericMonth > 12) {
        fail('Monat muss zwischen 1 und 12 liegen.', 400);
    }
    return [$numericYear, $numericMonth];
}

function monthStorageKey(int $year, int $month): string
{
    return sprintf('year:%04d:month:%02d', $year, $month);
}

function method(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function allow(array $methods): void
{
    if (in_array(method(), $methods, true)) {
        return;
    }
    header('Allow: ' . implode(', ', $methods));
    fail('Methode nicht erlaubt.', 405);
}

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    fail('Serverkonfiguration fehlt: api/config.php wurde nicht angelegt.', 500);
}
$config = require $configPath;
$maxBody = (int) ($config['maxBodyBytes'] ?? 4 * 1024 * 1024);

try {
    $store = new Store($config);
} catch (Throwable $error) {
    error_log('DienstplanRAD: Datenbankverbindung fehlgeschlagen: ' . $error->getMessage());
    // Der Text der Datenbankmeldung enthält Host und Benutzer. Er gehört ins
    // Serverprotokoll, nicht in eine öffentliche Antwort.
    fail('Datenbank nicht erreichbar.', 503);
}

$path = apiPath();

try {
    /** Einfache Schlüssel: gleicher Ablauf, nur anderer Grundtyp. */
    $simpleRoutes = [
        '/settings' => ['key' => 'app:settings', 'field' => 'settings', 'type' => 'object'],
        '/staff' => ['key' => 'app:staff', 'field' => 'staff', 'type' => 'list'],
        '/rbn-names' => ['key' => 'app:rbn-names', 'field' => 'rbnNames', 'type' => 'list'],
    ];

    if (isset($simpleRoutes[$path])) {
        $route = $simpleRoutes[$path];
        allow(['GET', 'PUT']);
        if (method() === 'GET') {
            sendJson(['ok' => true, $route['field'] => $store->get($route['key'])]);
        }
        $payload = decodeJson(requestBody($maxBody));
        // `PUT /api/rbn-names` nimmt historisch beides an: die nackte Liste und
        // ein Objekt mit dem Feld. Das bleibt so.
        if ($route['key'] === 'app:rbn-names' && isJsonObject($payload) && property_exists($payload, 'rbnNames')) {
            $payload = $payload->rbnNames;
        }
        if ($route['type'] === 'object' && !isJsonObject($payload)) {
            fail(sprintf('„%s“ muss ein JSON-Objekt sein.', $route['field']), 400);
        }
        if ($route['type'] === 'list' && !(is_array($payload) && array_is_list($payload))) {
            fail(sprintf('„%s“ muss ein Array sein.', $route['field']), 400);
        }
        if ($route['key'] === 'app:staff' && $payload === []) {
            fail('„staff“ muss mindestens einen gültigen Personal-Eintrag enthalten.', 400);
        }
        $store->put($route['key'], encodeForStorage($payload));
        sendJson(['ok' => true, $route['field'] => $payload]);
    }

    if ($path === '/bootstrap') {
        allow(['GET']);
        sendJson([
            'ok' => true,
            'settings' => $store->get('app:settings'),
            'staff' => $store->get('app:staff'),
            'rbnNames' => $store->get('app:rbn-names'),
        ]);
    }

    if (preg_match('#^/month/([^/]+)/([^/]+)$#', $path, $matches) === 1) {
        allow(['GET', 'PUT']);
        [$year, $month] = assertYearMonth($matches[1], $matches[2]);
        $key = monthStorageKey($year, $month);
        if (method() === 'GET') {
            // Lesen legt bewusst nichts an: Das Vorladen öffnet beim
            // Monatswechsel bis zu dreizehn Monate. Der Client baut aus `null`
            // selbst einen leeren Monat.
            sendJson(['ok' => true, 'month' => $store->get($key)]);
        }
        $payload = decodeJson(requestBody($maxBody));
        if (!isJsonObject($payload)) {
            fail('Der Monat muss ein JSON-Objekt sein.', 400);
        }
        $store->put($key, encodeForStorage($payload));
        sendJson(['ok' => true, 'month' => $payload]);
    }

    if ($path === '/export') {
        allow(['GET']);
        $months = [];
        foreach ($store->monthKeys() as $key) {
            $value = $store->get($key);
            if (!$value) {
                continue;
            }
            preg_match('/^year:(\d{4}):month:(\d{2})$/', $key, $parts);
            $months[] = ["{$parts[1]}-{$parts[2]}", $value];
        }
        sendJson([
            'ok' => true,
            'settings' => $store->get('app:settings'),
            'staff' => $store->get('app:staff'),
            'rbnNames' => $store->get('app:rbn-names'),
            'months' => $months,
        ]);
    }

    if ($path === '/import') {
        allow(['POST']);
        $payload = decodeJson(requestBody($maxBody));
        if (!isJsonObject($payload)) {
            fail('Die Wurzel muss ein JSON-Objekt sein.', 400);
        }
        $writes = [];
        foreach (['settings' => 'app:settings', 'staff' => 'app:staff', 'rbnNames' => 'app:rbn-names'] as $field => $key) {
            if (!property_exists($payload, $field)) {
                continue;
            }
            $value = $payload->$field;
            $listExpected = $field !== 'settings';
            if ($listExpected && !(is_array($value) && array_is_list($value))) {
                fail(sprintf('„%s“ muss ein Array sein.', $field), 400);
            }
            if (!$listExpected && !isJsonObject($value)) {
                fail('„settings“ muss ein JSON-Objekt sein.', 400);
            }
            $writes[] = [$key, encodeForStorage($value)];
        }
        $months = $payload->months ?? [];
        if (!(is_array($months) && array_is_list($months))) {
            fail('„months“ muss ein Array sein.', 400);
        }
        $seen = [];
        foreach ($months as $entry) {
            $valid = is_array($entry)
                && array_is_list($entry)
                && count($entry) === 2
                && is_string($entry[0])
                && preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $entry[0]) === 1
                && isJsonObject($entry[1]);
            if (!$valid) {
                fail('Jeder Monat muss als [„JJJJ-MM“, Monatsobjekt] vorliegen.', 400);
            }
            if (isset($seen[$entry[0]])) {
                fail(sprintf('Monat „%s“ ist in der Sicherung doppelt vorhanden.', $entry[0]), 400);
            }
            $seen[$entry[0]] = true;
            [$year, $month] = assertYearMonth(substr($entry[0], 0, 4), substr($entry[0], 5, 2));
            $writes[] = [monthStorageKey($year, $month), encodeForStorage($entry[1])];
        }
        try {
            $store->putAllAtomically($writes);
        } catch (Throwable $error) {
            error_log('DienstplanRAD: Serverimport fehlgeschlagen: ' . $error->getMessage());
            fail('Serverimport fehlgeschlagen und wurde vollständig zurückgerollt.', 500);
        }
        sendJson(['ok' => true, 'importedMonths' => count($months)]);
    }

    fail('Unbekannter Endpunkt.', 404);
} catch (JsonException $error) {
    fail('Ungültiges JSON.', 400);
} catch (Throwable $error) {
    error_log('DienstplanRAD: ' . $error->getMessage());
    fail('Interner Serverfehler', 500);
}
