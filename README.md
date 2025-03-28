# corese-benchmark

## Designing test suite for measuring performance

### Metrics 

* Memory consumption :
    * heap : max available to the JVM
    * used : used memory (or "used heap") to be measured after gc (garbage collector) call
        * see : https://stackoverflow.com/questions/10754748/monitoring-own-memory-usage-by-java-application
    * calculate the delta of used mem before and after the processes to be tested  
        * after    startup
        * before loading data
        * after data is loaded
        * after query exec

* Time of execution
    * function to use `System.currentTimeMillis()`.  Call before and after the process
    * what time to measure ?
        * loading data 
        * SPARQL query 
            * select 
            * count 

* Thread : bound to a series of JVM parameters (max, etc)
    * nb of threads actually used => Thread.activeCount() (see [here](https://www.baeldung.com/java-get-number-of-threads))
    * other instropection methods from : 
        * [`com.sun.management.OperatingSystemMXBean`](https://docs.oracle.com/en/java/javase/15/docs/api/jdk.management/com/sun/management/OperatingSystemMXBean.html)
        * [ThreadMXBean.html](https://docs.oracle.com/en/java/javase/15/docs/api/jdk.management/com/sun/management/ThreadMXBean.html)

* CPU usage : (NTH)
    * see  : https://stackoverflow.com/questions/63948968/how-to-get-cpu-utilization-using-java-11

* Nb of infered triples (NTH) : 
    * look the named graph used for infered 

* Config
    * inMemoryStore 
    * inference level (check if levels are comparable) :
        * no inference
        * RDFS 
    * format to be parsed :
        * turtle
        * trig


## HOW TO run it

* 1st build the execution environement

```bash
./gradlew  clean build
```
* then run it 

```bash
./gradlew  runGroovyScript
```