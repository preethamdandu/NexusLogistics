FROM golang:1.23-bookworm AS builder

RUN apt-get update && apt-get install -y git protobuf-compiler librdkafka-dev pkg-config \
  && go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.31.0 \
  && go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.3.0

WORKDIR /app
COPY ingestion-service/ ./

RUN mkdir -p pb \
  && protoc --go_out=paths=source_relative:pb --go-grpc_out=paths=source_relative:pb proto/tracker.proto \
  && go mod tidy \
  && go build -tags dynamic -o /simulator ./cmd/simulator

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y librdkafka1 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /simulator /simulator
COPY deploy/render/simulator/start.sh /start.sh
RUN chmod +x /start.sh
CMD ["/start.sh"]
