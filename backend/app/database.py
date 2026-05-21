from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = "sqlite:///./app.db"

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_migrations():
    inspector = inspect(engine)
    with engine.connect() as conn:
        tables = inspector.get_table_names()

        if "datasets" in tables:
            cols = {c["name"] for c in inspector.get_columns("datasets")}
            if "uploaded_by" not in cols:
                conn.execute(text("ALTER TABLE datasets ADD COLUMN uploaded_by INTEGER REFERENCES users(id)"))
            if "stored_filename" not in cols:
                conn.execute(text("ALTER TABLE datasets ADD COLUMN stored_filename VARCHAR"))
            if "file_path" not in cols:
                conn.execute(text("ALTER TABLE datasets ADD COLUMN file_path VARCHAR"))

        if "experiments" in tables:
            cols = {c["name"] for c in inspector.get_columns("experiments")}
            if "attachment_path" not in cols:
                conn.execute(text("ALTER TABLE experiments ADD COLUMN attachment_path VARCHAR"))
            if "attachment_filename" not in cols:
                conn.execute(text("ALTER TABLE experiments ADD COLUMN attachment_filename VARCHAR"))
            if "attachment_stored_name" not in cols:
                conn.execute(text("ALTER TABLE experiments ADD COLUMN attachment_stored_name VARCHAR"))
            if "linked_dataset_ids" not in cols:
                conn.execute(text("ALTER TABLE experiments ADD COLUMN linked_dataset_ids TEXT"))
            if "ipfs_hash" not in cols:
                conn.execute(text("ALTER TABLE experiments ADD COLUMN ipfs_hash VARCHAR"))
            if "ipfs_uploaded_at" not in cols:
                conn.execute(text("ALTER TABLE experiments ADD COLUMN ipfs_uploaded_at DATETIME"))
            if "integrity_verified" not in cols:
                conn.execute(text("ALTER TABLE experiments ADD COLUMN integrity_verified VARCHAR"))

        if "datasets" in tables:
            cols = {c["name"] for c in inspector.get_columns("datasets")}
            if "ipfs_hash" not in cols:
                conn.execute(text("ALTER TABLE datasets ADD COLUMN ipfs_hash VARCHAR"))
            if "ipfs_uploaded_at" not in cols:
                conn.execute(text("ALTER TABLE datasets ADD COLUMN ipfs_uploaded_at DATETIME"))
            if "integrity_verified" not in cols:
                conn.execute(text("ALTER TABLE datasets ADD COLUMN integrity_verified VARCHAR"))

        # Fix comments.resolved stored as VARCHAR instead of INTEGER
        # bool('0') == True in Python, so every comment appeared "Resolved"
        if "comments" in tables:
            cols = {c["name"]: str(c["type"]).upper() for c in inspector.get_columns("comments")}
            if cols.get("resolved", "") in ("VARCHAR", "TEXT", "BOOLEAN", "NVARCHAR", "CHAR"):
                conn.execute(text("ALTER TABLE comments RENAME TO _comments_old"))
                conn.execute(text("""
                    CREATE TABLE comments (
                        id INTEGER NOT NULL,
                        project_id INTEGER NOT NULL,
                        target_type VARCHAR NOT NULL,
                        target_id VARCHAR NOT NULL,
                        parent_id INTEGER,
                        author_id INTEGER NOT NULL,
                        content TEXT NOT NULL,
                        resolved INTEGER NOT NULL DEFAULT 0,
                        created_at DATETIME NOT NULL,
                        PRIMARY KEY (id)
                    )
                """))
                conn.execute(text("""
                    INSERT INTO comments (id, project_id, target_type, target_id, parent_id,
                                         author_id, content, resolved, created_at)
                    SELECT id, project_id, target_type, target_id, parent_id,
                           author_id, content,
                           CASE WHEN CAST(resolved AS TEXT) IN ('1','true','True') THEN 1 ELSE 0 END,
                           created_at FROM _comments_old
                """))
                conn.execute(text("DROP TABLE _comments_old"))

        conn.commit()
