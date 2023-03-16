#!/bin/sh

cd packages/ark-core && rm -Rf build \
&& cd ../../packages/ark-frontend && rm -Rf build \
&& cd ../../packages/ark-backend && rm -Rf build \
&& cd ../../packages/ark-devtools && rm -Rf build \
&& cd ../../packages/ark-cli && rm -Rf build && cd ../../

retVal=$?
if [ $retVal -ne 0 ]; then
    echo "Error"
fi
exit $retVal