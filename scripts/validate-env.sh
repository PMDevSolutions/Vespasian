#!/bin/bash
# validate-env.sh — validate the shape of Wix credentials in .env.
#
# Checks (values are NEVER printed — only variable names and verdicts):
#   * WIX_ACCOUNT_ID / WIX_SITE_ID / WIX_METASITE_ID are GUID-formatted
#   * WIX_API_KEY is present and not an obvious placeholder
#   * any *KEY/*SECRET/*PASSWORD var doesn't carry a default/insecure value
#   * .env is not tracked by git
#
# Exit codes: 0 = clean, 1 = problems found (or .env missing)

GUID_RE='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
INSECURE_PATTERNS="changeme|change-me|password|placeholder|example|your-|xxxx|12345|qwerty"

FOUND=0

if [ ! -f ".env" ]; then
    echo "WARN: No .env file found. Copy .env.example to .env and add your Wix credentials."
    echo "      (Dry-run mode, VESPASIAN_DRY_RUN=1, needs no credentials.)"
    exit 1
fi

# --- 1. Never commit .env ---
if command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; then
    if git ls-files --error-unmatch .env >/dev/null 2>&1; then
        echo "ERROR: .env is tracked by git — remove it from the index:"
        echo "       git rm --cached .env"
        FOUND=1
    fi
fi

# --- 2. Per-variable format checks ---
check_guid_var() {
    local name="$1" required="$2"
    local value
    value=$(grep -E "^${name}=" .env 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    if [ -z "$value" ]; then
        if [ "$required" = "required" ]; then
            echo "WARN: $name is not set"
            FOUND=1
        fi
        return
    fi
    if [[ ! "$value" =~ $GUID_RE ]]; then
        echo "WARN: $name is set but is not a GUID (expected xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)"
        FOUND=1
    fi
}

check_guid_var WIX_ACCOUNT_ID  required
check_guid_var WIX_SITE_ID     optional
check_guid_var WIX_METASITE_ID optional

API_KEY=$(grep -E "^WIX_API_KEY=" .env 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")
if [ -z "$API_KEY" ]; then
    echo "WARN: WIX_API_KEY is not set (get one at https://manage.wix.com/account/api-keys)"
    FOUND=1
elif echo "$API_KEY" | grep -qiE "$INSECURE_PATTERNS"; then
    echo "WARN: WIX_API_KEY looks like a placeholder value"
    FOUND=1
elif [ ${#API_KEY} -lt 30 ]; then
    echo "WARN: WIX_API_KEY looks too short to be a real account-level API key"
    FOUND=1
fi

# --- 3. Generic secret hygiene for every credential-shaped var ---
while IFS='=' read -r key value; do
    # Skip comments and empty lines
    [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue

    if [[ "$key" =~ (PASSWORD|SECRET|KEY|TOTP) ]] && [ "$key" != "WIX_API_KEY" ]; then
        if [ -n "$value" ] && echo "$value" | grep -qiE "$INSECURE_PATTERNS"; then
            echo "WARN: $key appears to use a default/insecure value"
            FOUND=1
        fi
    fi
done < .env

if [ "$FOUND" -eq 1 ]; then
    echo ""
    echo "Please fix the issues above in .env. Values were not printed on purpose;"
    echo "never paste credentials into logs, commits, or issues."
    exit 1
fi

echo "OK: .env credential formats look sane (values not printed)."
exit 0
