# steps: create pool => inspect => withdraw USDC when all done

# info:
# mainnet ido pool program id: 
#   7r2chJLUU87eaM7T1aBi6f7g9BbtbgnwQ9kPbMGxJQWV

# local env
# copy idl json (anchor build is ok, but need to replace program id)
mkdir -p target/idl && cp idl.json target/idl/ido_pool.json

export CLUSTER_RPC_URL=https://api.mainnet-beta.solana.com
export USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# replace with your config

export PRT_MINT=
# associated PRT token account will transfer PRT from
export PRT_TOKEN_FROM=

#get --withdraw_ts: node> new Date('2021-09-08T10:15:00.000Z').getTime()/1000

# Round 1
# --start_time: node> new Date('2021-09-08T04:00:00.000Z').getTime()/1000

node cli/index.js init $USDC_MINT $PRT_MINT $PRT_TOKEN_FROM 70 \
    --start_time 1631073600 --deposit_duration 5400 --cancel_duration 5400 --withdraw_ts 1631096100

export POOL1=

# Round 2
# --start_time: node> new Date('2021-09-08T07:00:00.000Z').getTime()/1000

node cli/index.js init $USDC_MINT $PRT_MINT $PRT_TOKEN_FROM 30 \
    --start_time 1631084400 --deposit_duration 5400 --cancel_duration 5400 --withdraw_ts 1631096100

export POOL2=

node cli/index.js inspect $POOL1
node cli/index.js inspect $POOL2



#===========================withdraw USDC when IDO over========================
node cli/index.js withdraw-usdc $POOL1
node cli/index.js withdraw-usdc $POOL2