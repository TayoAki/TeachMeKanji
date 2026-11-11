# Phone-preview relay (see relay.mjs): no dependencies, so the image is Node and one file.
ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE}
WORKDIR /relay
COPY relay.mjs .
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "relay.mjs"]
