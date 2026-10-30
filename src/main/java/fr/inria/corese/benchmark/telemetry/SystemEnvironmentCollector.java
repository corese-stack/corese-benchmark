package fr.inria.corese.benchmark.telemetry;

import java.lang.management.ManagementFactory;
import java.lang.management.RuntimeMXBean;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Collects a snapshot of the host system and JVM environment used to run benchmarks.
 *
 * <p>Information is primarily read from Linux pseudo-files ({@code /proc/cpuinfo},
 * {@code /proc/meminfo}, {@code /proc/sys/vm/swappiness}, {@code /etc/os-release}) and from
 * {@link ManagementFactory#getRuntimeMXBean()}. Every source is read defensively: if a file is
 * missing, unreadable, or does not contain the expected field, the collector falls back to a
 * reasonable value derived from JVM/System properties (or {@code "unknown"}/{@code -1} when no
 * fallback is available) instead of failing.
 */
public final class SystemEnvironmentCollector {

    private static final Path CPUINFO_PATH = Path.of("/proc/cpuinfo");
    private static final Path MEMINFO_PATH = Path.of("/proc/meminfo");
    private static final Path SWAPPINESS_PATH = Path.of("/proc/sys/vm/swappiness");
    private static final Path OS_RELEASE_PATH = Path.of("/etc/os-release");
    private static final String UNKNOWN = "unknown";

    private SystemEnvironmentCollector() {
        // Static utility class, not meant to be instantiated.
    }

    /**
     * Builds the environment description map.
     *
     * @return a mutable, insertion-ordered map containing the keys: {@code cpuModel},
     *         {@code cpuArchitecture}, {@code cpuSockets}, {@code cpuCores}, {@code cpuThreads},
     *         {@code cpuFrequencyMhz}, {@code cpuGovernor}, {@code ramTotalGb}, {@code swapTotalGb},
     *         {@code swappiness}, {@code osDistribution}, {@code osKernel}, {@code jvmVendor},
     *         {@code jvmVersion}, {@code jvmFlags} (as a {@code List<String>})
     */
    public static Map<String, Object> collect() {
        Map<String, Object> env = new LinkedHashMap<>();

        List<String> cpuinfoLines = readAllLinesOrEmpty(CPUINFO_PATH);
        List<String> meminfoLines = readAllLinesOrEmpty(MEMINFO_PATH);

        env.put("cpuModel", readCpuModel(cpuinfoLines));
        env.put("cpuArchitecture", readCpuArchitecture());
        env.put("cpuSockets", readCpuSockets(cpuinfoLines));
        env.put("cpuCores", readCpuCores(cpuinfoLines));
        env.put("cpuThreads", readCpuThreads(cpuinfoLines));
        env.put("cpuFrequencyMhz", readCpuFrequencyMhz(cpuinfoLines));
        env.put("cpuGovernor", readCpuGovernor());
        env.put("ramTotalGb", readRamTotalGb(meminfoLines));
        env.put("swapTotalGb", readSwapTotalGb(meminfoLines));
        env.put("swappiness", readSwappiness());
        env.put("osDistribution", readOsDistribution());
        env.put("osKernel", readOsKernel());
        env.put("jvmVendor", readJvmVendor());
        env.put("jvmVersion", readJvmVersion());
        env.put("jvmFlags", readJvmFlags());

        return env;
    }

    // ---------------------------------------------------------------------
    // CPU
    // ---------------------------------------------------------------------

    private static String readCpuModel(List<String> cpuinfoLines) {
        for (String line : cpuinfoLines) {
            if (line.startsWith("model name")) {
                String value = valueAfterColon(line);
                if (value != null && !value.isBlank()) {
                    return value.trim();
                }
            }
        }
        return System.getProperty("os.arch", UNKNOWN) + " CPU";
    }

    private static String readCpuArchitecture() {
        return System.getProperty("os.arch", UNKNOWN);
    }

    private static int readCpuSockets(List<String> cpuinfoLines) {
        java.util.Set<String> physicalIds = new java.util.HashSet<>();
        for (String line : cpuinfoLines) {
            if (line.startsWith("physical id")) {
                String value = valueAfterColon(line);
                if (value != null) {
                    physicalIds.add(value.trim());
                }
            }
        }
        if (!physicalIds.isEmpty()) {
            return physicalIds.size();
        }
        return 1;
    }

    private static int readCpuCores(List<String> cpuinfoLines) {
        java.util.Set<String> coreKeys = new java.util.LinkedHashSet<>();
        String currentPhysicalId = "0";
        String currentCoreId = null;
        for (String line : cpuinfoLines) {
            if (line.startsWith("physical id")) {
                String value = valueAfterColon(line);
                currentPhysicalId = (value != null) ? value.trim() : "0";
            } else if (line.startsWith("core id")) {
                currentCoreId = valueAfterColon(line);
                if (currentCoreId != null) {
                    coreKeys.add(currentPhysicalId + ":" + currentCoreId.trim());
                }
            }
        }
        if (!coreKeys.isEmpty()) {
            return coreKeys.size();
        }
        int threads = readCpuThreads(cpuinfoLines);
        return threads > 0 ? threads : Runtime.getRuntime().availableProcessors();
    }

    private static int readCpuThreads(List<String> cpuinfoLines) {
        int processorCount = 0;
        for (String line : cpuinfoLines) {
            if (line.startsWith("processor")) {
                processorCount++;
            }
        }
        if (processorCount > 0) {
            return processorCount;
        }
        return Runtime.getRuntime().availableProcessors();
    }

    private static double readCpuFrequencyMhz(List<String> cpuinfoLines) {
        for (String line : cpuinfoLines) {
            if (line.startsWith("cpu MHz")) {
                String value = valueAfterColon(line);
                if (value != null) {
                    try {
                        return Math.round(Double.parseDouble(value.trim()) * 10.0) / 10.0;
                    } catch (NumberFormatException ignored) {
                        // Fall through to next line / fallback.
                    }
                }
            }
        }
        return -1.0;
    }

    private static String readCpuGovernor() {
        Path governorPath = Path.of("/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor");
        try {
            if (Files.isReadable(governorPath)) {
                String content = Files.readString(governorPath).trim();
                if (!content.isEmpty()) {
                    return content;
                }
            }
        } catch (java.io.IOException | RuntimeException ignored) {
            // Fall through to the default below.
        }
        return UNKNOWN;
    }

    // ---------------------------------------------------------------------
    // Memory
    // ---------------------------------------------------------------------

    private static double readRamTotalGb(List<String> meminfoLines) {
        long kb = readMeminfoValueKb(meminfoLines, "MemTotal");
        if (kb >= 0) {
            return kbToGb(kb);
        }
        // Fallback: JVM-visible max heap is not the total RAM, but is the best signal available
        // without access to /proc/meminfo; it is clearly a lower bound.
        return kbToGb(Runtime.getRuntime().maxMemory() / 1024L);
    }

    private static double readSwapTotalGb(List<String> meminfoLines) {
        long kb = readMeminfoValueKb(meminfoLines, "SwapTotal");
        if (kb >= 0) {
            return kbToGb(kb);
        }
        return 0.0;
    }

    private static long readMeminfoValueKb(List<String> meminfoLines, String key) {
        Pattern pattern = Pattern.compile("^" + Pattern.quote(key) + "\\s*:\\s*(\\d+)\\s*kB\\s*$");
        for (String line : meminfoLines) {
            Matcher matcher = pattern.matcher(line.trim());
            if (matcher.matches()) {
                try {
                    return Long.parseLong(matcher.group(1));
                } catch (NumberFormatException ignored) {
                    return -1L;
                }
            }
        }
        return -1L;
    }

    private static double kbToGb(long kb) {
        return Math.round(kb / (1024.0 * 1024.0) * 100.0) / 100.0;
    }

    private static int readSwappiness() {
        try {
            if (Files.isReadable(SWAPPINESS_PATH)) {
                String content = Files.readString(SWAPPINESS_PATH).trim();
                if (!content.isEmpty()) {
                    return Integer.parseInt(content);
                }
            }
        } catch (java.io.IOException | RuntimeException ignored) {
            // Fall through to the default below.
        }
        return -1;
    }

    // ---------------------------------------------------------------------
    // Operating system
    // ---------------------------------------------------------------------

    private static String readOsDistribution() {
        try {
            if (Files.isReadable(OS_RELEASE_PATH)) {
                for (String line : Files.readAllLines(OS_RELEASE_PATH)) {
                    if (line.startsWith("PRETTY_NAME=")) {
                        String value = line.substring("PRETTY_NAME=".length()).trim();
                        return stripSurroundingQuotes(value);
                    }
                }
            }
        } catch (java.io.IOException | RuntimeException ignored) {
            // Fall through to the fallback below.
        }
        return System.getProperty("os.name", UNKNOWN) + " " + System.getProperty("os.version", "");
    }

    private static String readOsKernel() {
        return System.getProperty("os.version", UNKNOWN);
    }

    private static String stripSurroundingQuotes(String value) {
        if (value.length() >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
            return value.substring(1, value.length() - 1);
        }
        return value;
    }

    // ---------------------------------------------------------------------
    // JVM
    // ---------------------------------------------------------------------

    private static String readJvmVendor() {
        return System.getProperty("java.vendor", UNKNOWN);
    }

    private static String readJvmVersion() {
        return System.getProperty("java.version", UNKNOWN);
    }

    private static List<String> readJvmFlags() {
        try {
            RuntimeMXBean runtimeMXBean = ManagementFactory.getRuntimeMXBean();
            List<String> arguments = runtimeMXBean.getInputArguments();
            return (arguments != null) ? List.copyOf(arguments) : List.of();
        } catch (RuntimeException ignored) {
            return List.of();
        }
    }

    // ---------------------------------------------------------------------
    // Shared helpers
    // ---------------------------------------------------------------------

    private static List<String> readAllLinesOrEmpty(Path path) {
        try {
            if (Files.isReadable(path)) {
                return Files.readAllLines(path);
            }
        } catch (java.io.IOException | RuntimeException ignored) {
            // Fall through to the empty list below.
        }
        return new ArrayList<>();
    }

    private static String valueAfterColon(String line) {
        int colonIndex = line.indexOf(':');
        if (colonIndex < 0 || colonIndex + 1 >= line.length()) {
            return null;
        }
        return line.substring(colonIndex + 1);
    }
}
