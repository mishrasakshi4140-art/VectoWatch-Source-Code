import sqlite3

DATABASE_NAME = "vectowatch.db"


def get_connection():
    connection = sqlite3.connect(DATABASE_NAME)
    connection.row_factory = sqlite3.Row
    return connection


def create_tables():
    connection = get_connection()

    # Citizen reports
    connection.execute("""
        CREATE TABLE IF NOT EXISTS citizen_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_type TEXT NOT NULL,
            description TEXT,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Containment actions
    connection.execute("""
        CREATE TABLE IF NOT EXISTS containment_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL,
            action_type TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP,
            FOREIGN KEY (report_id) REFERENCES citizen_reports(id)
        )
    """)

    # Follow-up verification records
    connection.execute("""
        CREATE TABLE IF NOT EXISTS follow_up_verifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL,
            containment_action_id INTEGER NOT NULL,
            outcome TEXT NOT NULL CHECK (
                outcome IN ('resolved', 'still_present', 'needs_action')
            ),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (report_id) REFERENCES citizen_reports(id),
            FOREIGN KEY (containment_action_id) REFERENCES containment_actions(id)
        )
    """)

    connection.commit()

    # Create containment actions for any reports that
    # were already confirmed before this feature existed.
    confirmed_reports = connection.execute("""
        SELECT *
        FROM citizen_reports
        WHERE status = 'confirmed'
    """).fetchall()

    for report in confirmed_reports:

        existing_action = connection.execute("""
            SELECT id
            FROM containment_actions
            WHERE report_id = ?
        """, (report["id"],)).fetchone()

        if existing_action is None:

            connection.execute("""
                INSERT INTO containment_actions (
                    report_id,
                    action_type,
                    description,
                    status
                )
                VALUES (?, ?, ?, ?)
            """, (
                report["id"],
                "Remove standing water",
                "Confirmed breeding site requires field containment and removal of stagnant water.",
                "open"
            ))

    connection.commit()
    connection.close()