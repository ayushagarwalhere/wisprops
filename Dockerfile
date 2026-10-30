# WisprOps in a container. Zero npm dependencies; the image only adds git (release ids, postmortem PRs)
# and the docker CLI (for the docker/compose presets, with the host's socket mounted).
#
#   docker build -t wisprops .
#   docker run -d --name wisprops --network host --restart unless-stopped \
#     -v "$PWD/wisprops-data:/data" wisprops
#   docker logs wisprops        # prints the console sign-in link
#
# --network host keeps the console on the host's 127.0.0.1:7300, exactly as without Docker.
# Mount /var/run/docker.sock only if you use the docker or compose presets: it gives the container
# control of Docker on the host.
FROM node:22-alpine
RUN apk add --no-cache git docker-cli docker-cli-compose
WORKDIR /app
COPY package.json LICENSE README.md console.html ./
COPY bin ./bin
COPY server ./server
COPY src ./src
COPY public ./public
COPY demo/patient.js demo/ctl.js demo/wisprops.config.json ./demo/
VOLUME /data
WORKDIR /data
EXPOSE 7300
CMD ["node", "/app/bin/wisprops.js", "start", "--config", "/data/wisprops.config.json"]
