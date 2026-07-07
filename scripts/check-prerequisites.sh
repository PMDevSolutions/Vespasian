#!/bin/bash
#
# Prerequisites Verification Script
# Checks all required and optional tools for working with Vespasian.
#
# Required:  git, Node.js 20+, pnpm 9, Claude Code
# Optional:  GitHub CLI, jq, Wix CLI, Playwright browsers
# Also warns (never fails) on missing WIX_* credentials in .env.
#
# No Docker, no PHP, no Composer, no WP-CLI — Vespasian's output is a live
# Wix site driven over REST + Playwright, not a local server stack.
#
# Usage: ./scripts/check-prerequisites.sh
#
# Exit Codes:
#   0 - All required prerequisites met
#   1 - One or more required prerequisites missing
#   2 - Script execution error
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Counters
REQUIRED_PASS=0
REQUIRED_FAIL=0
OPTIONAL_PASS=0
OPTIONAL_SKIP=0
SYSTEM_PASS=0
SYSTEM_FAIL=0
WARNINGS=0

# Minimum versions
MIN_GIT_VERSION="2.30.0"
MIN_NODE_VERSION="20.0.0"
MIN_PNPM_MAJOR=9
MIN_GH_VERSION="2.0.0"
MIN_RAM_GB=4
MIN_DISK_GB=5

# Helper functions
print_header() {
    echo ""
    echo -e "${CYAN}$1${NC}"
    echo "$(echo "$1" | sed 's/./-/g')"
}

print_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
}

print_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Version comparison function
# Returns 0 if version1 >= version2
version_gte() {
    local v1="$1"
    local v2="$2"

    v1=$(echo "$v1" | sed 's/[^0-9.]//g')
    v2=$(echo "$v2" | sed 's/[^0-9.]//g')

    [ "$(printf '%s\n' "$v2" "$v1" | sort -V | head -n1)" = "$v2" ]
}

# Extract version number from various formats
extract_version() {
    grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1
}

# Check Git
check_git() {
    if command -v git &> /dev/null; then
        local version
        version=$(git --version 2>&1 | extract_version)
        if [ -n "$version" ] && version_gte "$version" "$MIN_GIT_VERSION"; then
            print_pass "Git $version (minimum: $MIN_GIT_VERSION)"
            ((REQUIRED_PASS++))
            return 0
        fi
        print_fail "Git $version (minimum: $MIN_GIT_VERSION required)"
        ((REQUIRED_FAIL++))
        return 1
    fi
    print_fail "Git not installed"
    echo "       Install: https://git-scm.com/downloads"
    ((REQUIRED_FAIL++))
    return 1
}

# Check Node.js (required — the pipeline, CLI, and Playwright all run on it)
check_node() {
    if command -v node &> /dev/null; then
        local version
        version=$(node --version 2>&1 | extract_version)
        if [ -n "$version" ] && version_gte "$version" "$MIN_NODE_VERSION"; then
            print_pass "Node.js $version (minimum: $MIN_NODE_VERSION)"
            ((REQUIRED_PASS++))
            return 0
        fi
        print_fail "Node.js $version (minimum: $MIN_NODE_VERSION required)"
        echo "       Install: https://nodejs.org/ (or use nvm/fnm)"
        ((REQUIRED_FAIL++))
        return 1
    fi
    print_fail "Node.js not installed"
    echo "       Install: https://nodejs.org/"
    ((REQUIRED_FAIL++))
    return 1
}

# Check pnpm 9.x (required — workspace package manager)
check_pnpm() {
    if command -v pnpm &> /dev/null; then
        local version major
        version=$(pnpm --version 2>&1 | extract_version)
        major=$(echo "$version" | cut -d. -f1)
        if [ -n "$major" ] && [ "$major" -ge "$MIN_PNPM_MAJOR" ]; then
            print_pass "pnpm $version (major >= $MIN_PNPM_MAJOR)"
            ((REQUIRED_PASS++))
            return 0
        fi
        print_fail "pnpm $version (9.x required)"
        echo "       Fix: corepack enable && corepack prepare pnpm@9.15.0 --activate"
        ((REQUIRED_FAIL++))
        return 1
    fi
    print_fail "pnpm not installed"
    echo "       Install: corepack enable && corepack prepare pnpm@9.15.0 --activate"
    ((REQUIRED_FAIL++))
    return 1
}

# Check Claude Code
check_claude() {
    if command -v claude &> /dev/null; then
        local version
        version=$(claude --version 2>&1 | extract_version)
        if [ -n "$version" ]; then
            print_pass "Claude Code $version"
        else
            print_pass "Claude Code installed"
        fi
        ((REQUIRED_PASS++))
        return 0
    fi
    print_fail "Claude Code not installed"
    echo "       Install: npm install -g @anthropic-ai/claude-code"
    echo "       Or visit: https://claude.ai/code"
    ((REQUIRED_FAIL++))
    return 1
}

# Check GitHub CLI (optional)
check_gh() {
    if command -v gh &> /dev/null; then
        local version
        version=$(gh --version 2>&1 | extract_version)
        if [ -n "$version" ]; then
            if gh auth status &> /dev/null; then
                print_pass "GitHub CLI $version (authenticated)"
            else
                print_pass "GitHub CLI $version (not authenticated)"
                echo "       Run 'gh auth login' to authenticate"
            fi
            ((OPTIONAL_PASS++))
            return 0
        fi
    fi
    print_skip "GitHub CLI not installed"
    echo "       Install: https://cli.github.com/"
    ((OPTIONAL_SKIP++))
    return 0
}

# Check jq (optional but used by hooks and plan-lint)
check_jq() {
    if command -v jq &> /dev/null; then
        local version
        version=$(jq --version 2>&1 | extract_version)
        print_pass "jq ${version:-installed} (used by hooks and plan-lint)"
        ((OPTIONAL_PASS++))
        return 0
    fi
    print_skip "jq not installed (hook scripts and plan-lint need it)"
    echo "       Install: https://jqlang.github.io/jq/ (brew install jq / apt install jq)"
    ((OPTIONAL_SKIP++))
    return 0
}

# Check Wix CLI (optional — used for Git-integration code pushes)
check_wix_cli() {
    if command -v wix &> /dev/null; then
        local version
        version=$(wix --version 2>&1 | extract_version)
        print_pass "Wix CLI ${version:-installed}"
        ((OPTIONAL_PASS++))
        return 0
    fi
    print_skip "Wix CLI not installed (only needed for global.css/Velo code pushes)"
    echo "       Install: npm install -g @wix/cli"
    ((OPTIONAL_SKIP++))
    return 0
}

# Check Playwright browsers (optional — required for editor automation + QA)
check_playwright() {
    if ! command -v node &> /dev/null; then
        print_skip "Playwright check skipped (Node.js missing)"
        ((OPTIONAL_SKIP++))
        return 0
    fi
    if node -e "require.resolve('playwright')" &> /dev/null || [ -d "node_modules/playwright" ]; then
        print_pass "Playwright package installed"
        ((OPTIONAL_PASS++))
        # Browser binaries: best-effort detection across default cache paths
        local cache_dirs=("$HOME/Library/Caches/ms-playwright" "$HOME/.cache/ms-playwright" "$LOCALAPPDATA/ms-playwright")
        local found=false
        for d in "${cache_dirs[@]}"; do
            if [ -n "$d" ] && [ -d "$d" ] && ls "$d" 2>/dev/null | grep -q "chromium"; then
                found=true
                break
            fi
        done
        if $found; then
            print_pass "Playwright Chromium browser installed"
        else
            print_warn "Playwright browsers may be missing — run: pnpm playwright:install (or ./scripts/setup-playwright.sh)"
            ((WARNINGS++))
        fi
        return 0
    fi
    print_skip "Playwright not installed yet — run: pnpm install"
    ((OPTIONAL_SKIP++))
    return 0
}

# Check .env for Wix credentials (warn, never fail — dry-run needs none)
check_wix_env() {
    if [ ! -f ".env" ]; then
        print_warn "No .env file — copy .env.example and add your Wix credentials"
        echo "       Dry-run mode (VESPASIAN_DRY_RUN=1) works without credentials."
        ((WARNINGS++))
        return 0
    fi

    local missing=()
    for var in WIX_API_KEY WIX_ACCOUNT_ID; do
        if ! grep -qE "^${var}=..*" .env 2>/dev/null; then
            missing+=("$var")
        fi
    done
    for var in WIX_SITE_ID; do
        if ! grep -qE "^${var}=..*" .env 2>/dev/null; then
            print_info "$var not set in .env (optional — written by 'vespasian site create|use')"
        fi
    done

    if [ ${#missing[@]} -eq 0 ]; then
        print_pass ".env carries WIX_API_KEY and WIX_ACCOUNT_ID"
        echo "       Validate formats with: ./scripts/validate-env.sh"
    else
        print_warn ".env missing: ${missing[*]}"
        echo "       Get an account-level API key: https://manage.wix.com/account/api-keys"
        echo "       Dry-run mode (VESPASIAN_DRY_RUN=1) works without credentials."
        ((WARNINGS++))
    fi
    return 0
}

# Check RAM
check_ram() {
    local ram_kb=0
    local ram_gb=0

    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        ram_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
        ram_gb=$((ram_kb / 1024 / 1024))
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        ram_bytes=$(sysctl -n hw.memsize)
        ram_gb=$((ram_bytes / 1024 / 1024 / 1024))
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ -n "$WINDIR" ]]; then
        ram_kb=$(wmic OS get TotalVisibleMemorySize 2>/dev/null | grep -E '^[0-9]+' | head -1 | tr -d ' \r')
        if [ -n "$ram_kb" ]; then
            ram_gb=$((ram_kb / 1024 / 1024))
        else
            ram_gb=$MIN_RAM_GB
        fi
    fi

    if [ "$ram_gb" -ge "$MIN_RAM_GB" ]; then
        print_pass "RAM: ${ram_gb} GB (minimum: ${MIN_RAM_GB} GB)"
        ((SYSTEM_PASS++))
        return 0
    elif [ "$ram_gb" -gt 0 ]; then
        print_fail "RAM: ${ram_gb} GB (minimum: ${MIN_RAM_GB} GB required)"
        ((SYSTEM_FAIL++))
        return 1
    else
        print_info "RAM: Could not detect (minimum: ${MIN_RAM_GB} GB)"
        ((SYSTEM_PASS++))
        return 0
    fi
}

# Check Disk Space
check_disk() {
    local disk_free_gb=0
    local cwd
    cwd=$(pwd)

    if [[ "$OSTYPE" == "linux-gnu"* ]] || [[ "$OSTYPE" == "darwin"* ]]; then
        disk_free_kb=$(df -k "$cwd" | tail -1 | awk '{print $4}')
        disk_free_gb=$((disk_free_kb / 1024 / 1024))
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ -n "$WINDIR" ]]; then
        disk_free_gb=$(df -k "$cwd" 2>/dev/null | tail -1 | awk '{print $4}' | head -1)
        if [ -n "$disk_free_gb" ]; then
            disk_free_gb=$((disk_free_gb / 1024 / 1024))
        else
            disk_free_gb=$MIN_DISK_GB
        fi
    fi

    if [ "$disk_free_gb" -ge "$MIN_DISK_GB" ]; then
        print_pass "Disk: ${disk_free_gb} GB free (minimum: ${MIN_DISK_GB} GB)"
        ((SYSTEM_PASS++))
        return 0
    elif [ "$disk_free_gb" -gt 0 ]; then
        print_fail "Disk: ${disk_free_gb} GB free (minimum: ${MIN_DISK_GB} GB required)"
        ((SYSTEM_FAIL++))
        return 1
    else
        print_info "Disk: Could not detect (minimum: ${MIN_DISK_GB} GB)"
        ((SYSTEM_PASS++))
        return 0
    fi
}

# Check Operating System
check_os() {
    local os_name=""
    local supported=false

    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if [ -f /etc/os-release ]; then
            os_name=$(grep PRETTY_NAME /etc/os-release | cut -d= -f2 | tr -d '"')
        else
            os_name="Linux"
        fi
        supported=true
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        os_name="macOS $(sw_vers -productVersion)"
        supported=true
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ -n "$WINDIR" ]]; then
        os_name="Windows"
        if command -v cmd &> /dev/null; then
            win_ver=$(cmd //c ver 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1)
            if [ -n "$win_ver" ]; then
                os_name="Windows $win_ver"
            fi
        fi
        supported=true
    else
        os_name="Unknown ($OSTYPE)"
    fi

    if [ "$supported" = true ]; then
        print_pass "OS: $os_name (supported)"
        ((SYSTEM_PASS++))
        return 0
    else
        print_fail "OS: $os_name (may not be fully supported)"
        ((SYSTEM_FAIL++))
        return 1
    fi
}

# Main execution
main() {
    echo ""
    echo -e "${CYAN}=== Vespasian Prerequisites Check ===${NC}"

    print_header "REQUIRED SOFTWARE"
    check_git
    check_node
    check_pnpm
    check_claude

    print_header "REQUIRED ACCOUNTS"
    print_info "Wix account with a Studio workspace - Manual verification required"
    echo "       API keys: https://manage.wix.com/account/api-keys (account-level)"
    print_info "Figma Dev Mode (for the Figma pipeline) - Manual verification required"
    echo "       Open Figma > Press Shift+D > Dev Mode panel should appear"
    check_gh

    print_header "OPTIONAL SOFTWARE"
    check_jq
    check_wix_cli
    check_playwright

    print_header "WIX CREDENTIALS (.env)"
    check_wix_env

    print_header "SYSTEM REQUIREMENTS"
    check_ram
    check_disk
    check_os

    # Summary
    echo ""
    echo -e "${CYAN}=== Summary ===${NC}"
    echo "Required: $REQUIRED_PASS/$((REQUIRED_PASS + REQUIRED_FAIL)) passed"
    echo "Optional: $OPTIONAL_PASS/$((OPTIONAL_PASS + OPTIONAL_SKIP)) installed"
    echo "System:   $SYSTEM_PASS/$((SYSTEM_PASS + SYSTEM_FAIL)) passed"
    [ "$WARNINGS" -gt 0 ] && echo "Warnings: $WARNINGS (see above — none are blocking)"
    echo ""

    if [ "$REQUIRED_FAIL" -eq 0 ] && [ "$SYSTEM_FAIL" -eq 0 ]; then
        echo -e "${GREEN}Ready to use Vespasian: YES${NC}"
        echo ""
        echo "Next steps:"
        echo "  1. Install dependencies:  pnpm install"
        echo "  2. Run the setup wizard:  pnpm run init"
        echo "  3. Open Claude Code:      claude"
        echo ""
        exit 0
    else
        echo -e "${RED}Ready to use Vespasian: NO${NC}"
        echo ""
        echo "Please install missing requirements above, then run this script again."
        echo ""
        echo "Documentation: docs/PREREQUISITES.md"
        echo ""
        exit 1
    fi
}

# Run main function
main "$@"
