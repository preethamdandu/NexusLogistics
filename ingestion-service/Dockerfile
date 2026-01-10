FROM golang:1.23-bookworm AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y git protobuf-compiler librdkafka-dev pkg-config

# Install protoc-gen-go and protoc-gen-go-grpc
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.31.0 && \
    go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.3.0

WORKDIR /app

# Copy go.mod and sum files
COPY go.mod ./
COPY . .

# Generate Protobuf files
RUN mkdir -p pb
WORKDIR /app/proto
RUN protoc --go_out=paths=source_relative:../pb --go-grpc_out=paths=source_relative:../pb tracker.proto
WORKDIR /app

# Build the application
# Use dynamic linking for ARM64/AMD64 compatibility
RUN go mod tidy
RUN go build -tags dynamic -o ingestion-service main.go

# Final stage
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y librdkafka1 && rm -rf /var/lib/apt/lists/*

WORKDIR /root/

COPY --from=builder /app/ingestion-service .

EXPOSE 50051
EXPOSE 9090

CMD ["./ingestion-service"]
