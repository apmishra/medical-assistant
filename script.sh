# Stop current container
docker-compose down

# Remove old image
docker rmi medical-assistant:latest

# Rebuild with new backend
docker-compose build --no-cache

# Start container
docker-compose up -d

# Watch logs to verify
docker-compose logs -f
