FROM alpine:3.20

RUN apk add --no-cache postgresql16-client rclone supercronic tzdata

ENV TZ=Europe/Paris

COPY backup.sh /backup.sh
COPY crontab /crontab
RUN chmod +x /backup.sh

CMD ["supercronic", "/crontab"]
