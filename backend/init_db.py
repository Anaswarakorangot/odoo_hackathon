from app.db.database import engine, Base
import app.models
import app.models.user_settings

Base.metadata.create_all(bind=engine)
print("Tables created.")
