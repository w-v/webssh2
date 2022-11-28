FROM node:16-alpine

# ENV DEBUG="WebSSH2"

RUN apk update && apk add bash git yarn gcc g++ python3 make

WORKDIR /home/node

VOLUME /home/node

ENTRYPOINT [ "bash", "bootstrap.sh" ]

