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

    /** Compute median of an array of long values. */
    public static long median(long[] values) {
        long[] sorted = values.clone();
        java.util.Arrays.sort(sorted);
        int mid = sorted.length / 2;
        return sorted.length % 2 == 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
    }

    /** Compute throughput in triples/second. */
    public static double throughput(long triples, long timeMs) {
        if (timeMs <= 0) return 0;
        return triples / (timeMs / 1000.0);
    }
}
