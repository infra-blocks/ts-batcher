import { expect, sinon } from "@infra-blocks/test";
import { injectFakeTimersFixtures } from "@infra-blocks/test/mocha/bdd";
import { Batcher } from "../../src/index.js";

describe("batcher", () => {
  it("should be empty upon creation", () => {
    const batcher = Batcher.create<number>();
    expect(batcher.isEmpty()).to.be.true;
    expect(batcher.size()).to.equal(0);
  });
  it("should emit the 'push' event on push with the correct item", () => {
    const handler = sinon.fake();
    const batcher = Batcher.create().on("push", handler);
    const item = 42;
    batcher.push(item);
    expect(handler).to.have.been.calledOnceWith(item);
  });
  it("should emit the 'flush' event with an empty batch on flush without items", () => {
    const handler = sinon.fake();
    const batcher = Batcher.create().on("flush", handler);
    batcher.flush();
    expect(handler).to.have.been.calledOnceWith([]);
  });
  it("should reset the internal buffer on flush and emit the 'flush' event with the items accumulated so far", () => {
    const handler = sinon.fake();
    const batcher = Batcher.create().on("flush", handler);
    batcher.push(1);
    batcher.push(2);
    batcher.flush();
    expect(batcher.isEmpty()).to.be.true;
    expect(batcher.size()).to.equal(0);
    // Sanity check.
    batcher.push(3);
    batcher.flush();
    expect(handler).to.have.been.calledTwice;
    expect(handler.firstCall).to.have.been.calledWith([1, 2]);
    expect(handler.secondCall).to.have.been.calledWith([3]);
    expect(batcher.isEmpty()).to.be.true;
    expect(batcher.size()).to.equal(0);
  });
  describe("flushAtSize", () => {
    it("should throw with a negative threshold", () => {
      expect(() => Batcher.create().flushAtSize(-1)).to.throw();
    });
    it("should throw with a zero threshold", () => {
      expect(() => Batcher.create().flushAtSize(0)).to.throw();
    });
    it("should flush on push with a threshold of 1", () => {
      const handler = sinon.fake();
      const batcher = Batcher.create().flushAtSize(1).on("flush", handler);
      batcher.push("hello");
      expect(handler).to.have.been.calledOnce;
      expect(handler.getCall(0)).to.have.been.calledWith(["hello"]);
      batcher.push("world");
      expect(handler).to.have.been.calledTwice;
      expect(handler.getCall(1)).to.have.been.calledWith(["world"]);
    });
  });
  describe("flushWhenTrue", () => {
    it("should flush when the predicate returns true", () => {
      let sum = 0;
      const predicate = sinon.fake(() => sum >= 10);
      const handler = sinon.fake(() => {
        sum = 0;
      });
      const batcher = Batcher.create<number>()
        .on("flush", handler)
        .on("push", (item) => {
          sum += item;
        })
        .flushWhenTrue(predicate);

      batcher.push(1); // sum = 1
      expect(predicate).to.have.been.calledOnce;
      expect(predicate.getCall(0)).to.have.been.calledWith(batcher);
      expect(handler).to.not.have.been.called;

      batcher.push(2); // sum = 3
      expect(predicate).to.have.been.calledTwice;
      expect(predicate.getCall(1)).to.have.been.calledWith(batcher);
      expect(handler).to.not.have.been.called;

      batcher.push(3); // sum = 6
      expect(predicate).to.have.been.calledThrice;
      expect(predicate.getCall(2)).to.have.been.calledWith(batcher);
      expect(handler).to.not.have.been.called;

      batcher.push(4); // sum = 10, now it should flush.
      expect(predicate).to.have.callCount(4);
      expect(predicate.getCall(3)).to.have.been.calledWith(batcher);
      expect(handler).to.have.been.calledOnce;
      expect(handler.getCall(0)).to.have.been.calledWith([1, 2, 3, 4]);
    });
  });
  describe("flushAtLeastEvery", () => {
    injectFakeTimersFixtures();

    it("should flush at the specified frequency", async function () {
      const handler = sinon.fake();
      const batcher = Batcher.create<number>()
        .flushAtLeastEvery(1000)
        .on("flush", handler);
      batcher.push(1);
      await this.clock.tickAsync(999);
      expect(handler).to.not.have.been.called;
      await this.clock.tickAsync(1);
      expect(handler).to.have.been.calledOnceWith([1]);
      batcher.push(2);
      await this.clock.tickAsync(500);
      expect(handler).to.have.been.calledOnce;
      await this.clock.tickAsync(500);
      expect(handler).to.have.been.calledTwice;
      expect(handler.getCall(1)).to.have.been.calledWith([2]);
    });
    it("should flush empty batches by default", async function () {
      const handler = sinon.fake();
      Batcher.create<number>().flushAtLeastEvery(1000).on("flush", handler);
      await this.clock.tickAsync(1000);
      expect(handler).to.have.been.calledOnceWith([]);
      await this.clock.tickAsync(1000);
      expect(handler).to.have.been.calledTwice;
      expect(handler.getCall(1)).to.have.been.calledWith([]);
    });
    it("should not flush empty batches when configured to do so", async function () {
      const handler = sinon.fake();
      Batcher.create<number>()
        .flushAtLeastEvery(1000, { skipEmpty: true })
        .on("flush", handler);
      await this.clock.tickAsync(1000);
      expect(handler).to.not.have.been.called;
      await this.clock.tickAsync(1000);
      expect(handler).to.not.have.been.called;
    });
    it("should reset the timer on independant flushes", async function () {
      const handler = sinon.fake();
      const batcher = Batcher.create<number>()
        .flushAtLeastEvery(1000)
        .on("flush", handler);
      batcher.push(1);
      await this.clock.tickAsync(500);
      // Explicit flushing should reset the timer.
      batcher.flush();
      expect(handler).to.have.been.calledOnceWith([1]);
      batcher.push(2);
      await this.clock.tickAsync(500);
      // Should not be called again by the scheduled flush at this point.
      expect(handler).to.have.been.calledOnce;
      // Now the timer should fully expire.
      await this.clock.tickAsync(500);
      expect(handler).to.have.been.calledTwice;
      expect(handler.getCall(1)).to.have.been.calledWith([2]);
    });
  });
});
