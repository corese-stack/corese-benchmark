package fr.inria.corese.benchmark.metrics;

/** Outcome of the complete load protocol for one engine/dataset/file. */
public enum FileStatus {
    SUCCESS, TIMEOUT, OOM, ERROR
}
