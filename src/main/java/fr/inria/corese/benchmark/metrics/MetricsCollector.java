package fr.inria.corese.benchmark.metrics;

import com.sun.management.OperatingSystemMXBean;
import java.lang.management.ManagementFactory;

/**
 * Collects JVM memory and CPU metrics during benchmark execution.
 */
public class MetricsCollector {

    private final OperatingSystemMXBean osBean;

    public MetricsCollector() {
        this.osBean = (OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
    }

    /** Force garbage collection and return used heap memory in MB. */
    public double getUsedMemoryMb() {
        System.gc();
        System.gc();
        Runtime rt = Runtime.getRuntime();
        long used = rt.totalMemory() - rt.freeMemory();
        return used / (1024.0 * 1024.0);
    }

    /** Return current JVM CPU usage as a percentage (0-100). */
    public double getCpuPercent() {
        double cpu = osBean.getProcessCpuLoad();
        return cpu < 0 ? 0.0 : cpu * 100.0;
    }

    /**
     * Compute median of an array of long values, ignoring sentinel -1 values
     * (used to mark timeouts or failed repetitions).
     * Returns -1 if all values are -1.
     */
    public static long median(long[] values) {
        long[] valid = java.util.Arrays.stream(values).filter(v -> v >= 0).toArray();
        if (valid.length == 0) return -1L;
        java.util.Arrays.sort(valid);
        int mid = valid.length / 2;
        return valid.length % 2 == 0
            ? (valid[mid - 1] + valid[mid]) / 2
            : valid[mid];
    }

    /** Compute median of an array of double values. */
    public static double medianDouble(double[] values) {
        if (values == null || values.length == 0) return 0.0;
        double[] sorted = values.clone();
        java.util.Arrays.sort(sorted);
        int mid = sorted.length / 2;
        return sorted.length % 2 == 0
            ? (sorted[mid - 1] + sorted[mid]) / 2.0
            : sorted[mid];
    }

    /** Compute throughput in triples/second. */
    public static double throughput(long triples, long timeMs) {
        if (timeMs <= 0) return 0;
        return triples / (timeMs / 1000.0);
    }

    /** Returns current used heap in bytes without a forced GC. */
    public static long usedHeapBytes() {
        Runtime rt = Runtime.getRuntime();
        return rt.totalMemory() - rt.freeMemory();
    }
}
