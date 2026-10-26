# 多阶段构建：编译单二进制后放进极简镜像
FROM golang:1.25-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/aiwrite-api .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /out/aiwrite-api /app/aiwrite-api
COPY etc/aiwrite-api.yaml /app/etc/aiwrite-api.yaml
EXPOSE 8787
ENTRYPOINT ["/app/aiwrite-api", "-f", "/app/etc/aiwrite-api.yaml"]
