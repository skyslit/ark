#!/bin/sh

cd packages/ark-core && jest . --coverage --testTimeout=60000 \
&& cd ../../packages/ark-backend && jest . --coverage --testTimeout=60000 --maxWorkers=1 \
&& cd ../../packages/ark-frontend && jest . --coverage --testTimeout=60000 --maxWorkers=1 \
&& cd ../../packages/ark-devtools && jest . --coverage --testTimeout=60000 --maxWorkers=1 \
&& cd ../../packages/ark-cli && jest . --coverage --testTimeout=60000 && cd ../../

retVal=$?
if [ $retVal -ne 0 ]; then
    echo "Error"
fi
exit $retVal