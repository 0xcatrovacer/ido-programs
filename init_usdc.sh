NEW_MINT=$(spl-token create-token --decimals 6 | awk -F"token " '/token /{print $2}')
NEW_ACC=$(spl-token create-account $NEW_MINT | awk -F"account " '/account /{print $2}')

echo "NEW USDC MINT: $NEW_MINT - $NEW_ACC"
spl-token mint $NEW_MINT 1000000000 $NEW_ACC

spl-token transfer $NEW_MINT 100000000 87kgu5qmjyKS5xz6ZJX1EWCcT8jbtqcbLCGEDq5NyV2L --fund-recipient --allow-unfunded-recipient

spl-token transfer $NEW_MINT 100000000 EnXuXEDkfrG79RnQtbv4RTBDw6qGdVWLgRgPLGYE4nC1 --fund-recipient --allow-unfunded-recipient

spl-token transfer $NEW_MINT 100000000 ATaxcEd16jd1KA4Mm49GjaLKEoNSfaTvdMAh3iKAwnZg --fund-recipient --allow-unfunded-recipient

spl-token transfer $NEW_MINT 100000000 CvXJSFj2Mg9Xq4byEWtvxaYRynYhaYRqbfp5mvshRG9u --fund-recipient --allow-unfunded-recipient