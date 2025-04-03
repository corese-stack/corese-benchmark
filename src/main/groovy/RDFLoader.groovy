interface RDFLoader {
    void init()
    void loadFile(String filepath)
    long getGraphSize()
    void close()
}