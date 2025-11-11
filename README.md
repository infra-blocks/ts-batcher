# ts-batcher
[![Build](https://github.com/infra-blocks/ts-batcher/actions/workflows/build.yml/badge.svg)](https://github.com/infra-blocks/ts-batcher/actions/workflows/build.yml)
[![Release](https://github.com/infra-blocks/ts-batcher/actions/workflows/release.yml/badge.svg)](https://github.com/infra-blocks/ts-batcher/actions/workflows/release.yml)
[![codecov](https://codecov.io/gh/infra-blocks/ts-batcher/graph/badge.svg?token=ZG3QFPRW3O)](https://codecov.io/gh/infra-blocks/ts-batcher)

This package provides functionalities for batching situations which are better served by an event based API.

# API

The package exports a `Batcher` class that is created as such:
```ts
import { Batcher } from "@infra-blocks/batcher";

const batcher = Batcher.create<number>();
```

It is generic over the type of items it contains for type safety convenience, but defaults to using `unknown` as the type when not provided.

`Batcher`s export 2 main events: `push`, and `flush`, and two main methods: `push` and, surprisingly, `flush`.
This simple design make the utility fairly extensible. Here is an example where we want batches every time the sum of the items is over 10:
```ts
import { Batcher } from "@infra-blocks/batcher";

let sum = 0;
const batcher = Batcher.create<number>().on("push", (item) => {
  sum += item;
  if (sum > 10) {
    batcher.flush();
  }
}).on("flush", (batch) => {
  // Reset the sum to 0 for the next batch.
  sum = 0;
  // The `batch` parameter is a read-only array of the items accumulated to far.
  console.log("received batch %s", JSON.stringify(batch));
});
for (let i = 0; i < 10; i++) {
  batcher.push(i);       
}
/*
Prints the following:
received batch [0,1,2,3,4,5]
received batch [6,7]
received batch [8,9]
*/
```

The API already offers a few auto flushing utilities, such as `flushAtSize`, that automatically flushes the `Batcher` when it reaches
a given number of items, and `flushAtLeastEvery` that attaches a timer that automatically flushes the `Batcher` every time it expires.
They make use of the events API listed above under the covers.

