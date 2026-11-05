export const oracleAbi = [
  {
    type: 'event',
    name: 'PrintReceived',
    inputs: [
      { name: 'key', type: 'bytes32', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'sessionId', type: 'uint64', indexed: false },
      { name: 'kind', type: 'uint8', indexed: false },
      { name: 'tokenPrice', type: 'uint256', indexed: false },
      { name: 'multiplier', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint64', indexed: false },
    ],
  },
] as const

export const controllerAbi = [
  {
    type: 'function',
    name: 'lastNonce',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint64' }],
  },
  {
    type: 'function',
    name: 'scheduleHash',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const
