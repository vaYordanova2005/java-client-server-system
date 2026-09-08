# --- Build stage ---
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app

COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -B dependency:go-offline

COPY src/ src/
RUN ./mvnw -B package -DskipTests

# --- Run stage ---
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar

# Render sets $PORT and routes traffic to it; application.yml falls back to
# SERVER_PORT/8080 for local runs where PORT isn't set.
ENV PORT=8080
EXPOSE 8080
# -XX:TieredStopAtLevel=1 -Xshare:auto trade peak throughput for a faster
# cold start, which matters on CPU-throttled free-tier hosts where the JIT's
# own warmup work can push the port open past the platform's scan timeout.
ENTRYPOINT ["sh", "-c", "java -XX:TieredStopAtLevel=1 -Xshare:auto -jar app.jar --server.port=${PORT}"]
