#!/bin/bash
set -e

echo "🚀 Starting Kiplombe Frontend (Production Mode)..."

# 1. Ensure dependencies are correct
if [ -d "node_modules" ] && [ "$(ls -A node_modules 2>/dev/null)" ]; then
    echo "✅ Dependencies already installed"
    MOD_COUNT=$(find node_modules -maxdepth 1 -type d 2>/dev/null | wc -l)
    echo "   Found $MOD_COUNT packages"
else
    echo "📦 Installing dependencies (this will take 3-5 minutes)..."
    echo "   This is normal for first startup - dependencies install at runtime"
    echo "   Progress will be shown below..."
    # Using --legacy-peer-deps to handle common UI library conflicts
    npm install --legacy-peer-deps --prefer-offline --no-audit --no-fund 2>&1 | while IFS= read -r line; do
        # Show progress for important messages
        if echo "$line" | grep -qE "(added|removed|changed|audited|found)"; then
            echo "   $line"
        fi
    done
    echo "✅ Dependencies installation completed!"
fi

# 2. Pre-Build Diagnostic (CRITICAL for debugging "Module Not Found")
echo "🔍 Running pre-build diagnostic..."
if [ -f "tsconfig.json" ]; then
    echo "✅ tsconfig.json found"
    # Check if the alias is defined
    grep -q "@/\*" tsconfig.json && echo "✅ Alias @/* defined in tsconfig" || echo "❌ Alias @/* MISSING in tsconfig"
else
    echo "❌ tsconfig.json NOT FOUND in $(pwd)"
fi

if [ -d "components/ui" ]; then
    echo "✅ components/ui directory found"
else
    echo "❌ components/ui directory NOT FOUND"
    ls -F
fi

# 3. Build only if output is missing (standalone server OR static export)
if [ -f ".next/standalone/server.js" ]; then
    echo "✅ Standalone build already exists, skipping rebuild..."
elif [ -f "out/index.html" ] && [ -f ".next/BUILD_ID" ]; then
    echo "✅ Static export (out/) already present, skipping rebuild..."
else
    echo "🧹 Cleaning old build artifacts..."
    rm -rf .next out

    echo "📦 Building Next.js application..."
    export DOCKER_BUILD=true
    [ -n "$NEXT_PUBLIC_API_URL" ] && export NEXT_PUBLIC_API_URL && echo "🔗 API URL: $NEXT_PUBLIC_API_URL"

    # Execute build (webpack can sit on "Creating an optimized production build" for many minutes on low-RAM hosts — not always frozen)
    echo "=== next build starting ($(date -u +%H:%M:%S)Z) ==="
    echo "   Tip: first build often takes 15–40+ min; host free -h can look fine while the *container* is cgroup-limited — check: docker inspect kiplombe_frontend --format '{{.HostConfig.Memory}}' (bytes; 0 = unlimited)"
    echo "   Watch: docker stats kiplombe_frontend (if MEM% pegged near limit for hours, raise compose deploy.resources.limits.memory)"
    set +e
    ( n=1; while sleep 90; do
        echo "   … build still running [${n}] $(date -u +%H:%M:%SZ) — if CPU is 0% for 15+ min, check OOM: dmesg | tail -20 | grep -i oom"
        n=$((n+1))
      done ) &
    _HB_PID=$!
    npm run build
    BUILD_EXIT=$?
    kill "${_HB_PID}" 2>/dev/null
    wait "${_HB_PID}" 2>/dev/null
    set -e
    if [ "${BUILD_EXIT}" -ne 0 ]; then
        echo "❌ Build failed! This usually means the paths in tsconfig.json don't match the folder structure."
        echo "Showing directory structure for debugging:"
        find . -maxdepth 2 -not -path '*/.*'
        exit 1
    fi
    echo "=== next build finished OK ($(date -u +%H:%M:%S)Z) ==="
fi

echo "✅ Build completed successfully!"
if [ -d "out" ]; then
    echo "📂 Static export (first files in out/):"
    ls -la out 2>/dev/null | head -15 || true
fi

# 4. Standalone Mode Configuration
if [ -d ".next/standalone" ]; then
    echo "📦 Setting up standalone build..."

    # Ensure .next directory exists in standalone
    mkdir -p .next/standalone/.next

    # Copy public folder to standalone (always ensure it's there)
    if [ -d "public" ]; then
        if [ ! -d ".next/standalone/public" ] || [ "$(find public -type f | wc -l)" -gt "$(find .next/standalone/public -type f 2>/dev/null | wc -l)" ]; then
            echo "   Copying public folder..."
            cp -r public .next/standalone/ 2>/dev/null || true
        fi
    fi

    # Always ensure static files are copied (critical for serving assets)
    if [ -d ".next/static" ]; then
        ORIGINAL_COUNT=$(find .next/static -type f 2>/dev/null | wc -l)
        STANDALONE_COUNT=$(find .next/standalone/.next/static -type f 2>/dev/null | wc -l)

        # Copy if missing or if standalone has fewer files (incomplete copy)
        if [ ! -d ".next/standalone/.next/static" ] || [ "$STANDALONE_COUNT" -lt "$ORIGINAL_COUNT" ]; then
            echo "   Copying static files to standalone build..."
            rm -rf .next/standalone/.next/static 2>/dev/null || true
            cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
            FINAL_COUNT=$(find .next/standalone/.next/static -type f 2>/dev/null | wc -l)
            echo "   ✓ Static files copied ($FINAL_COUNT files)"
        else
            echo "   ✓ Static files already present ($STANDALONE_COUNT files)"
        fi
    else
        echo "   ⚠️  WARNING: .next/static directory not found!"
    fi

    # Copy server files (always ensure they're there)
    if [ -d ".next/server" ]; then
        if [ ! -d ".next/standalone/.next/server" ]; then
            echo "   Copying server files..."
            cp -r .next/server .next/standalone/.next/ 2>/dev/null || true
        fi
    fi

    # Copy build metadata (always ensure it's there)
    if [ -f ".next/BUILD_ID" ]; then
        cp .next/BUILD_ID .next/standalone/.next/ 2>/dev/null || true
    fi
    cp .next/*.json .next/standalone/.next/ 2>/dev/null || true

    echo "✅ Standalone build configured"

    # Final verification
    echo "   Verifying standalone build integrity..."
    if [ -d ".next/standalone/.next/static" ]; then
        STATIC_COUNT=$(find .next/standalone/.next/static -type f 2>/dev/null | wc -l)
        if [ "$STATIC_COUNT" -gt 0 ]; then
            echo "   ✓ Found $STATIC_COUNT static files in standalone build"
        else
            echo "   ✗ Static files directory exists but is empty!"
        fi
    else
        echo "   ✗ Static files directory missing in standalone build!"
    fi

    if [ -f ".next/standalone/server.js" ]; then
        echo "   ✓ server.js found"
    else
        echo "   ✗ server.js NOT FOUND in standalone build!"
    fi
fi

# 5. Start the Server
echo "🎯 Starting Next.js server..."

if [ -f ".next/standalone/server.js" ]; then
    echo "🚀 Using standalone mode: node .next/standalone/server.js"
    echo "   Working directory: $(pwd)/.next/standalone"
    echo "   Verifying static files are accessible..."
    if [ -d ".next/standalone/.next/static" ]; then
        echo "   ✓ Static files directory exists"
    else
        echo "   ✗ WARNING: Static files directory missing!"
    fi
    cd .next/standalone
    exec node server.js
elif [ -f "out/index.html" ] || [ -f "out/hmis/index.html" ]; then
    # basePath /hmis → HTML references /hmis/_next/... — export is usually flat in out/, so we serve a parent folder with hmis/ mapping to out/.
    echo "🚀 Static export — http://0.0.0.0:3000/hmis/ (basePath /hmis)"
    SERVE_BIN="./node_modules/.bin/serve"
    if [ ! -f "$SERVE_BIN" ]; then
        echo "❌ missing $SERVE_BIN — ensure \"serve\" is in package.json and npm install ran."
        exit 1
    fi
    if [ -f "out/hmis/index.html" ]; then
        exec "$SERVE_BIN" out -l "tcp://0.0.0.0:3000" --no-clipboard -n
    fi
    mkdir -p .serve-root
    rm -rf .serve-root/hmis
    ln -sfn "$(pwd)/out" .serve-root/hmis
    if [[ -f "deploy/serve-hmis.json" ]]; then
      cp deploy/serve-hmis.json .serve-root/serve.json
    fi
    exec "$SERVE_BIN" .serve-root -l "tcp://0.0.0.0:3000" --no-clipboard -n
else
    echo "❌ No standalone server and no static export (expected out/index.html — check next.config output: export + distDir must not be 'out')."
    echo "Listing out/:"
    ls -la out 2>/dev/null || echo "(no out directory)"
    exit 1
fi
