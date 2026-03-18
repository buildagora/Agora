# Agora Brand Assets

## Logo Lockup

The `agora-lockup.png` file should contain the exact Agora brand lockup (stylized "A" + "Agora" wordmark).

### To add the real logo:

1. Get the complete base64 PNG data
2. Run the script:
   ```bash
   AGORA_LOGO_BASE64="<complete-base64-string>" node scripts/write-agora-logo.mjs
   ```
   
   OR place the base64 in `scripts/agoraLogoBase64.txt` and run:
   ```bash
   node scripts/write-agora-logo.mjs
   ```

3. The script will write the PNG to `public/brand/agora-lockup.png`

**Note:** Currently a 1x1 transparent placeholder PNG exists. Replace it with the real logo image.







