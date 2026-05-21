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

        conn.commit()
