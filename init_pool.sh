NEW_MINT=SHDWyBxihqiCj6YekG2GUr7wqKLeLAMK1gHZck9pL6y
NEW_ACC=GbPCCQ37wpD53eujkASFHLUK8LZxVnm3E4YZFda7CmBy
AUTHORITY=ShadowCZHrd8i6NrHkj2oAhJxBy8cFo3ggwB7NyoC4h
IDO_AMOUNT=30000000
IDO_START_TS=1641218400
IDO_DEPOSIT_PERIOD_SEC=86400
IDO_CANCEL_PERIOD_SEC=0
IDO_WITHDRAW_TS=1641304800
USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

echo "NEW MINT: $NEW_MINT - $NEW_ACC"
# spl-token mint $NEW_MINT $IDO_AMOUNT $NEW_ACC

node cli/index.js init $USDC_MINT $NEW_MINT $NEW_ACC $IDO_AMOUNT $AUTHORITY --start_time $IDO_START_TS --deposit_duration $IDO_DEPOSIT_PERIOD_SEC --cancel_duration $IDO_CANCEL_PERIOD_SEC --withdraw_ts $IDO_WITHDRAW_TS
