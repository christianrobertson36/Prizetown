# Run from: C:\Users\Windows11\Documents\GitHub\Prizetown
# Replace christianrobertson36 if you use a different GitHub Container Registry owner.

docker build -t ghcr.io/christianrobertson36/prizetown-api:v1 .\api
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

docker build -t ghcr.io/christianrobertson36/prizetown-web:v1 .\web
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

docker push ghcr.io/christianrobertson36/prizetown-api:v1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

docker push ghcr.io/christianrobertson36/prizetown-web:v1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
