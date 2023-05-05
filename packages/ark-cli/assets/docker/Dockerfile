FROM public.ecr.aws/skyslit/node:14.16-slim

WORKDIR /app
ENV PATH /app/node_modules/.bin:$PATH

RUN echo "deb http://archive.debian.org/debian stretch main" > /etc/apt/sources.list
RUN apt-get update -y
RUN apt-get install python -y
RUN apt-get install build-essential -y

COPY package.json ./
COPY package-lock.json ./
RUN npm install
COPY . ./
RUN npm run build

ENV NODE_PORT=80
EXPOSE 80

CMD ["node", "./build/server/main.js"]
