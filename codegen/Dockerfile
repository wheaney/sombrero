# To run the build from the package root:
#    docker build -f ./codegen/Dockerfile -t "sombrero" .
#    docker run --rm -i -v ./:/sombrero --entrypoint /sombrero/codegen/entrypoint.sh "sombrero"

FROM debian:latest

RUN apt-get update && apt-get install -y wget

ENTRYPOINT [ "/sombrero/codegen/entrypoint.sh" ]