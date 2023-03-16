#!/bin/sh

cd packages/ark-core && npm run build \
&& cd ../../packages/ark-frontend && npm run build \
&& cd ../../packages/ark-backend && npm run build \
&& cd ../../packages/ark-devtools && npm run build \
&& cd ../../packages/ark-cli && npm run build && cd ../../

retVal=$?
if [ $retVal -ne 0 ]; then
    echo "Error"
fi
exit $retVal