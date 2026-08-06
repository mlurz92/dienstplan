<?php
/**
 * Schlüssel-Wert-Ablage auf PDO — der Ersatz für Workers KV.
 *
 * Die Schlüssel sind dieselben wie in KV (`app:settings`, `app:staff`,
 * `app:rbn-names`, `year:JJJJ:month:MM`). Damit bleiben Sicherungen, die aus
 * der Cloudflare-Fassung stammen, ohne Umrechnung gültig, und der Umzug ist
 * umkehrbar.
 *
 * Anders als KV ist die Ablage transaktionsfähig. Der Serverimport braucht
 * deshalb keine nachgebaute Rücksetzung mehr: Entweder alle Schlüssel sind
 * geschrieben oder keiner.
 */

final class Store
{
    private PDO $db;

    public function __construct(array $config)
    {
        $this->db = new PDO($config['dsn'], $config['user'] ?? null, $config['password'] ?? null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $this->createTable();
    }

    /**
     * Legt die Tabelle beim ersten Aufruf an. Ein Einrichtungsschritt weniger,
     * den man beim Umzug vergessen kann.
     *
     * `utf8mb4_bin` ist Absicht: Schlüssel müssen zeichengenau unterschieden
     * werden, eine sortierende Kollation würde Groß- und Kleinschreibung
     * zusammenfallen lassen.
     */
    private function createTable(): void
    {
        $driver = $this->db->getAttribute(PDO::ATTR_DRIVER_NAME);
        if ($driver === 'sqlite') {
            $this->db->exec('CREATE TABLE IF NOT EXISTS dienstplan_kv (
                k TEXT PRIMARY KEY,
                v TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )');
            return;
        }
        $this->db->exec('CREATE TABLE IF NOT EXISTS dienstplan_kv (
            k VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
            v LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (k)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin');
    }

    /** Rohtext oder null. Die Antwort geht unverändert an den Client. */
    public function getRaw(string $key): ?string
    {
        $statement = $this->db->prepare('SELECT v FROM dienstplan_kv WHERE k = ?');
        $statement->execute([$key]);
        $row = $statement->fetch();
        return $row === false ? null : $row['v'];
    }

    public function get(string $key): mixed
    {
        $raw = $this->getRaw($key);
        return $raw === null ? null : json_decode($raw, false, 64);
    }

    public function put(string $key, string $rawJson): void
    {
        $driver = $this->db->getAttribute(PDO::ATTR_DRIVER_NAME);
        $sql = $driver === 'sqlite'
            ? 'INSERT INTO dienstplan_kv (k, v, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at'
            : 'INSERT INTO dienstplan_kv (k, v, updated_at) VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE v = VALUES(v), updated_at = VALUES(updated_at)';
        $this->db->prepare($sql)->execute([$key, $rawJson, gmdate('Y-m-d H:i:s')]);
    }

    /** Alle Monatsschlüssel, aufsteigend — die Reihenfolge der Sicherung. */
    public function monthKeys(): array
    {
        $statement = $this->db->query("SELECT k FROM dienstplan_kv WHERE k LIKE 'year:%' ORDER BY k ASC");
        $keys = [];
        foreach ($statement as $row) {
            if (preg_match('/^year:\d{4}:month:(0[1-9]|1[0-2])$/', $row['k']) === 1) {
                $keys[] = $row['k'];
            }
        }
        return $keys;
    }

    /**
     * Schreibt mehrere Schlüssel in einer Transaktion.
     *
     * @param array<int, array{0: string, 1: string}> $entries Schlüssel und fertiger JSON-Text.
     */
    public function putAllAtomically(array $entries): void
    {
        $this->db->beginTransaction();
        try {
            foreach ($entries as [$key, $rawJson]) {
                $this->put($key, $rawJson);
            }
            $this->db->commit();
        } catch (Throwable $error) {
            $this->db->rollBack();
            throw $error;
        }
    }
}
